#!/usr/bin/env python3
"""MRT2 streaming bridge for RiXing 轻听.

Talks JSON-line protocol over stdin/stdout.  Audio plays to system output via
sounddevice (PortAudio).  Stderr carries human-readable logs.

Protocol (→ host to bridge, ← bridge to host):

  → {"cmd":"init"}
  ← {"type":"status","stage":"loading"|"ready"|"error","message":"..."}

  → {"cmd":"start","prompt":"lo-fi hip hop","drums":true}
  ← {"type":"status","stage":"playing"}

  → {"cmd":"prompt","text":"ambient piano"}
  ← {"type":"status","stage":"playing"}

  → {"cmd":"drums","on":false}
  ← {"type":"status","stage":"playing"}

  → {"cmd":"stop"}
  ← {"type":"status","stage":"stopped"}

  → {"cmd":"quit"}
  (process exits cleanly)
"""

from __future__ import annotations

import json
import queue
import sys
import threading
import time

try:
    import numpy as np
except ImportError:
    sys.stdout.write(json.dumps({
        "type": "error",
        "message": "numpy not installed. Run: pip install numpy"
    }) + "\n")
    sys.stdout.flush()
    sys.exit(1)

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
_tx_lock = threading.Lock()


def send(msg: dict) -> None:
    with _tx_lock:
        sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def log(msg: str) -> None:
    print(f"[mrt2-bridge] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# constants
# ---------------------------------------------------------------------------
SAMPLE_RATE = 48000
CHANNELS = 2
RING_SECS = 6
DTYPE = np.float32
FADE_FRAMES = 1920  # ~40 ms at 48k — 用于开/关流的淡入淡出

# 第一块开头淡入 ramp（sin² 0→1），避免从静音直流跳变 click。
_FADE_IN_RAMP = (np.sin(np.linspace(0.0, np.pi / 2.0, FADE_FRAMES)) ** 2)[:, np.newaxis]


# ---------------------------------------------------------------------------
# FocusMusicEngine
# ---------------------------------------------------------------------------
class FocusMusicEngine:
    def __init__(self) -> None:
        self.mrt = None
        self._state = None  # MRT2 generation state, None before first chunk
        self._style: np.ndarray | None = None
        self._drums: bool = True
        self._playing: bool = False
        self._volume: float = 0.8
        self._applied_volume: float = 0.8  # 回调里实际乘的音量（向 _volume 平滑过渡）
        self._fade_in_ramp = _FADE_IN_RAMP
        self._fade_started: bool = False  # 第一块已做淡入

        # sounddevice OutputStream
        self._output_stream = None

        # pending changes (applied by main loop between chunks)
        self._pending_prompt: str | None = None
        self._pending_drums: bool | None = None

        # ring buffer
        ring_frames = int(SAMPLE_RATE * RING_SECS)
        self._ring = np.zeros((ring_frames, CHANNELS), dtype=DTYPE)
        self._ring_capacity = ring_frames
        self._write_head = 0
        self._read_head = 0
        self._ring_lock = threading.Lock()

    # -- ring buffer helpers ------------------------------------------------

    def _ring_available(self) -> int:
        d = self._write_head - self._read_head
        return d if d >= 0 else d + self._ring_capacity

    def _ring_free(self) -> int:
        return self._ring_capacity - self._ring_available() - 1

    def _ring_write(self, chunk: np.ndarray) -> None:
        n = chunk.shape[0]
        if n <= 0:
            return
        with self._ring_lock:
            free = self._ring_free()
            # drop oldest samples to make room
            while free < n:
                drop = min(n - free, self._ring_available())
                self._read_head = (self._read_head + drop) % self._ring_capacity
                free = self._ring_free()
            end = self._write_head + n
            if end <= self._ring_capacity:
                self._ring[self._write_head : end] = chunk
            else:
                first = self._ring_capacity - self._write_head
                self._ring[self._write_head :] = chunk[:first]
                self._ring[: end - self._ring_capacity] = chunk[first:]
            self._write_head = end % self._ring_capacity

    def _ring_read(self, n: int) -> np.ndarray:
        with self._ring_lock:
            avail = self._ring_available()
            if avail < n:
                out = np.zeros((n, CHANNELS), dtype=DTYPE)
                if avail > 0:
                    end = self._read_head + avail
                    if end <= self._ring_capacity:
                        out[:avail] = self._ring[self._read_head : end]
                    else:
                        first = self._ring_capacity - self._read_head
                        out[:first] = self._ring[self._read_head :]
                        out[first:avail] = self._ring[: end - self._ring_capacity]
                self._read_head = (self._read_head + avail) % self._ring_capacity
                return out
            end = self._read_head + n
            if end <= self._ring_capacity:
                out = self._ring[self._read_head : end].copy()
            else:
                first = self._ring_capacity - self._read_head
                out = np.empty((n, CHANNELS), dtype=DTYPE)
                out[:first] = self._ring[self._read_head :]
                out[first:] = self._ring[: end - self._ring_capacity]
            self._read_head = end % self._ring_capacity
            return out

    # -- audio callback -----------------------------------------------------

    def _audio_callback(self, outdata: np.ndarray, frames: int, _time_info, _status) -> None:
        data = self._ring_read(frames)
        target = self._volume
        cur = self._applied_volume
        # 音量平滑：拖动滑块时 target 阶跃变化，直接乘会产生 click；
        # 在一个 callback block（~40ms）内从 cur ramp 到 target。
        if abs(target - cur) > 1e-3 and frames > 0:
            ramp = np.linspace(cur, target, frames, dtype=DTYPE)[:, np.newaxis]
            data *= ramp
            self._applied_volume = target
        else:
            data *= target
        outdata[:] = data

    # -- style embedding (synchronous; MLX/TFLite ops stay on the main thread) --

    def _update_style(self, prompt: str) -> None:
        prompt = self._make_prompt(prompt)
        log(f"embedding style: {prompt}")
        try:
            self._style = self.mrt.embed_style(prompt)
        except Exception as exc:
            log(f"embed_style failed: {exc}")
            send({"type": "error", "message": str(exc)})

    # -- generation step (called from main loop; MLX ops on main thread) ----

    def step(self) -> bool:
        """Generate one chunk and feed the ring buffer. Runs on the main thread
        so MLX arrays (loaded/created on this thread during init) stay on the
        same thread — MLX streams are thread-local and a worker thread would
        raise "There is no Stream(gpu, 1) in current thread".

        Returns True if a chunk was generated, False if skipped (ring nearly
        full → backpressure, 让主循环 sleep 等音频消费).
        """
        if not self._playing:
            return False
        # 背压：环形缓冲快满时不再生成，否则 _ring_write 会丢弃最旧的未播放
        # 音频（造成跳帧/卡顿）。留出一个 chunk 的余量。
        if self._ring_available() > self._ring_capacity - 96000:  # 余 <1s 就等
            return False
        # apply pending changes before this chunk
        if self._pending_prompt is not None:
            self._update_style(self._pending_prompt)
            self._pending_prompt = None
        if self._pending_drums is not None:
            self._drums = self._pending_drums
            self._pending_drums = None
        try:
            self._generate_chunk()
        except Exception as exc:
            log(f"generate_chunk failed: {exc}")
            send({"type": "error", "message": str(exc)})
            self._playing = False
        return True

    def _generate_chunk(self) -> None:
        waveform, self._state = self.mrt.generate(
            style=self._style,
            state=self._state,
        )
        # waveform is a Waveform object with .samples (np.ndarray, shape (frames, 2))
        samples = np.asarray(waveform.samples, dtype=DTYPE)
        if samples.ndim == 1:
            samples = np.column_stack((samples, samples))
        elif samples.ndim == 2 and samples.shape[1] == 1:
            samples = np.column_stack((samples[:, 0], samples[:, 0]))

        # 不做 chunk 间交叉淡入淡出：模型是带状态自回归的，generate(state=prev)
        # 产出的音频与上一块天然连续（实测边界样本差 0.0008，比块内逐样本差还小）。
        # 之前的 AudioFade 把上一块尾部加到下一块开头，等于重复播一段，反而造成破音。
        # 仅在播放起止时做短淡入淡出，避免开/关流时的直流跳变 click。
        if self._state is None or not self._fade_started:
            # 第一块：开头淡入，避免从静音突跳
            n = min(FADE_FRAMES, samples.shape[0])
            samples[:n] *= self._fade_in_ramp[:n]
            self._fade_started = True
        self._ring_write(samples)

    # -- prompt building ----------------------------------------------------

    def _make_prompt(self, user_prompt: str) -> str:
        p = user_prompt.strip()
        if self._drums:
            return p
        return p + ", no drums, no percussion"

    # -- public API ---------------------------------------------------------

    def init(self) -> bool:
        send({"type": "status", "stage": "loading", "message": "正在加载 MRT2 模型…"})
        try:
            from magenta_rt import MagentaRT2Mlxfn
            import sounddevice as _sd
        except ImportError as exc:
            send({"type": "error", "message": f"依赖缺失: {exc}"})
            return False

        try:
            # 用 mrt2_small（0.46GB）：实测 ~0.75s 生成 1s 音频，1.33× 实时，
            # 能跟上播放。mrt2_base 实测 2s/1s = 0.5× 实时，会持续 underrun 卡顿。
            # 在更快的 Mac 上可改 "mrt2_base" 获得更好音质。
            self.mrt = MagentaRT2Mlxfn(size="mrt2_small")
            send({"type": "status", "stage": "ready"})
            return True
        except FileNotFoundError:
            send({
                "type": "error",
                "message": "MRT2 模型权重未找到，请运行: mrt models init && mrt models download mrt2_small",
            })
            return False
        except Exception as exc:
            send({"type": "error", "message": f"MRT2 初始化失败: {exc}"})
            return False

    def start(self, prompt: str) -> None:
        if self.mrt is None:
            send({"type": "error", "message": "MRT2 not initialised – call init first"})
            return
        if self._playing:
            self._pending_prompt = prompt
            return

        log(f"starting with prompt: {prompt}")
        self._state = None
        self._fade_started = False
        self._update_style(prompt)

        with self._ring_lock:
            self._write_head = 0
            self._read_head = 0
            self._ring.fill(0.0)

        self._playing = True

        # 预生成首块再开音频流：否则开流后环形缓冲为空，要等第一个 chunk
        # 生成完（~0.75s）才有声音，期间是静音"播放"。预填一块让音频一开就响。
        try:
            self._generate_chunk()
        except Exception as exc:
            log(f"first chunk failed: {exc}")
            send({"type": "error", "message": str(exc)})
            self._playing = False
            return

        import sounddevice as sd
        self._output_stream = sd.OutputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            callback=self._audio_callback,
            blocksize=int(SAMPLE_RATE * 0.04),
        )
        self._output_stream.start()

        # 不再另起生成线程：MLX 流是线程局部的，worker 线程会抛
        # "There is no Stream(gpu, 1) in current thread"。生成由主循环驱动。
        send({"type": "status", "stage": "playing"})

    def stop(self) -> None:
        if not self._playing:
            send({"type": "status", "stage": "stopped"})
            return
        log("stopping")
        self._playing = False

        if self._output_stream is not None:
            self._output_stream.stop()
            self._output_stream.close()
            self._output_stream = None

        self._state = None
        self._fade_started = False

        with self._ring_lock:
            self._ring.fill(0.0)
            self._write_head = 0
            self._read_head = 0

        self._pending_prompt = None
        self._pending_drums = None

        send({"type": "status", "stage": "stopped"})

    def set_prompt(self, text: str) -> None:
        log(f"prompt change: {text}")
        if self._playing:
            self._pending_prompt = text
        send({"type": "status", "stage": "playing"})

    def set_drums(self, on: bool) -> None:
        log(f"drums: {on}")
        if self._playing:
            self._pending_drums = on
        else:
            self._drums = on
        send({"type": "status", "stage": "playing" if self._playing else "stopped"})

    def set_volume(self, vol: float) -> None:
        self._volume = max(0.0, min(1.0, vol))

    def is_playing(self) -> bool:
        return self._playing


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> None:
    engine = FocusMusicEngine()
    log("bridge started, waiting for commands")

    # stdin 读取放独立线程：主线程要驱动 MLX 生成（MLX 流是线程局部的）。
    cmd_queue: "queue.Queue[dict | str]" = queue.Queue()

    def stdin_reader() -> None:
        try:
            for raw in sys.stdin:
                line = raw.strip()
                if not line:
                    continue
                try:
                    cmd_queue.put(json.loads(line))
                except json.JSONDecodeError:
                    log(f"bad json: {line!r}")
        finally:
            cmd_queue.put("__eof__")  # stdin closed → 退出

    threading.Thread(target=stdin_reader, daemon=True).start()

    def handle(msg: dict) -> bool:
        """处理一条命令，返回 True 表示应退出。"""
        cmd = msg.get("cmd", "")
        if cmd == "init":
            engine.init()
        elif cmd == "start":
            engine.start(msg.get("prompt", "lo-fi hip hop, mellow"))
        elif cmd == "stop":
            engine.stop()
        elif cmd == "prompt":
            engine.set_prompt(msg.get("text", ""))
        elif cmd == "drums":
            engine.set_drums(msg.get("on", True))
        elif cmd == "volume":
            engine.set_volume(msg.get("level", 0.8))
        elif cmd == "status":
            send({"type": "status", "stage": "playing" if engine.is_playing() else "stopped"})
        elif cmd == "quit":
            engine.stop()
            log("exiting")
            return True
        else:
            send({"type": "error", "message": f"unknown command: {cmd}"})
        return False

    while True:
        if engine.is_playing():
            # 播放中：主线程生成一个 chunk（MLX），再非阻塞地处理积压命令。
            # mrt2_small 一个 chunk ≈1s 音频，生成 ~0.75s（1.33× 实时），快于
            # 播放消耗，所以环形缓冲会越来越满；step() 在快满时返回 False（背压），
            # 这时 sleep 一下让音频消费。
            generated = engine.step()
            while True:
                try:
                    msg = cmd_queue.get_nowait()
                except queue.Empty:
                    break
                if msg == "__eof__":
                    engine.stop()
                    log("stdin closed, shutting down")
                    return
                if handle(msg):  # quit
                    return
            if not generated:
                time.sleep(0.05)  # 环形缓冲快满，等音频 drain
        else:
            # 空闲：阻塞等命令，省 CPU
            msg = cmd_queue.get()
            if msg == "__eof__":
                log("stdin closed, shutting down")
                return
            if handle(msg):
                return

    log("bridge shutting down")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        send({"type": "error", "message": f"Bridge crashed: {exc}"})
