// 码放（Tidy）：把当前活跃的窗口（任意 App）码放到屏幕的左半 / 右半 / 铺满 / 复原。
// 依赖 macOS 辅助功能(Accessibility)权限，通过 AXUIElement 读写窗口的位置与尺寸。
#![cfg(target_os = "macos")]

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::Mutex;
use std::sync::OnceLock;

use core_foundation::base::{CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::geometry::{CGPoint, CGSize};

// ---- AXUIElement / AXValue FFI（手写，避免额外依赖与版本冲突）----
type AXUIElementRef = *mut c_void;
type AXValueRef = *mut c_void;
type AXError = i32;

const K_AX_VALUE_CGPOINT: u32 = 1; // kAXValueCGPointType
const K_AX_VALUE_CGSIZE: u32 = 2; // kAXValueCGSizeType
const AX_ERROR_SUCCESS: AXError = 0;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;
    fn AXUIElementSetAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: CFTypeRef,
    ) -> AXError;
    fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut i32) -> AXError;
    fn AXValueCreate(the_type: u32, value_ptr: *const c_void) -> AXValueRef;
    fn AXValueGetValue(value: AXValueRef, the_type: u32, value_ptr: *mut c_void) -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFTypeRef) -> bool;
}

#[derive(Clone, Copy, Debug)]
pub enum TileAction {
    Left,
    Right,
    Maximize,
    Restore,
}

/// 屏幕坐标系下的矩形（左上角原点，单位：点），与 AX 一致。
#[derive(Clone, Copy, Debug)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

// 记录每个 App（按 pid）码放前的窗口尺寸，供「复原」使用。
fn prev_frames() -> &'static Mutex<HashMap<i32, Rect>> {
    static P: OnceLock<Mutex<HashMap<i32, Rect>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 是否已获得辅助功能权限。`prompt=true` 时会弹出系统授权引导。
pub fn accessibility_trusted(prompt: bool) -> bool {
    unsafe {
        if prompt {
            let key = CFString::from_static_string("AXTrustedCheckOptionPrompt");
            let val = CFBoolean::true_value();
            let dict = CFDictionary::from_CFType_pairs(&[(
                key.as_CFType(),
                val.as_CFType(),
            )]);
            AXIsProcessTrustedWithOptions(dict.as_CFTypeRef())
        } else {
            AXIsProcessTrustedWithOptions(std::ptr::null())
        }
    }
}

unsafe fn copy_attr(element: AXUIElementRef, attr: &str) -> Option<CFTypeRef> {
    let a = CFString::new(attr);
    let mut out: CFTypeRef = std::ptr::null();
    let err = AXUIElementCopyAttributeValue(element, a.as_concrete_TypeRef(), &mut out);
    if err == AX_ERROR_SUCCESS && !out.is_null() {
        Some(out)
    } else {
        None
    }
}

/// 取系统当前聚焦的窗口（任意 App）及其 pid。
unsafe fn focused_window() -> Option<(AXUIElementRef, i32)> {
    let system = AXUIElementCreateSystemWide();
    if system.is_null() {
        return None;
    }
    let app = copy_attr(system, "AXFocusedApplication")? as AXUIElementRef;
    let win = copy_attr(app, "AXFocusedWindow")? as AXUIElementRef;
    let mut pid: i32 = 0;
    AXUIElementGetPid(win, &mut pid);
    Some((win, pid))
}

unsafe fn get_frame(win: AXUIElementRef) -> Option<Rect> {
    let pos_ref = copy_attr(win, "AXPosition")? as AXValueRef;
    let size_ref = copy_attr(win, "AXSize")? as AXValueRef;
    let mut p = CGPoint { x: 0.0, y: 0.0 };
    let mut s = CGSize {
        width: 0.0,
        height: 0.0,
    };
    let ok_p = AXValueGetValue(pos_ref, K_AX_VALUE_CGPOINT, &mut p as *mut _ as *mut c_void);
    let ok_s = AXValueGetValue(size_ref, K_AX_VALUE_CGSIZE, &mut s as *mut _ as *mut c_void);
    if ok_p && ok_s {
        Some(Rect {
            x: p.x,
            y: p.y,
            w: s.width,
            h: s.height,
        })
    } else {
        None
    }
}

unsafe fn set_frame(win: AXUIElementRef, r: Rect) {
    let pos = CGPoint { x: r.x, y: r.y };
    let size = CGSize {
        width: r.w,
        height: r.h,
    };
    let pos_val = AXValueCreate(K_AX_VALUE_CGPOINT, &pos as *const _ as *const c_void);
    let size_val = AXValueCreate(K_AX_VALUE_CGSIZE, &size as *const _ as *const c_void);
    let pos_attr = CFString::new("AXPosition");
    let size_attr = CFString::new("AXSize");
    // 先尺寸后位置再尺寸：兼容部分会“吸附/限制”尺寸的窗口
    if !size_val.is_null() {
        AXUIElementSetAttributeValue(win, size_attr.as_concrete_TypeRef(), size_val);
    }
    if !pos_val.is_null() {
        AXUIElementSetAttributeValue(win, pos_attr.as_concrete_TypeRef(), pos_val);
    }
    if !size_val.is_null() {
        AXUIElementSetAttributeValue(win, size_attr.as_concrete_TypeRef(), size_val);
        cf_release(size_val);
    }
    if !pos_val.is_null() {
        cf_release(pos_val);
    }
}

extern "C" {
    fn CFRelease(cf: *const c_void);
}
unsafe fn cf_release(p: *mut c_void) {
    CFRelease(p as *const c_void);
}

// ---- 屏幕可视区域（排除菜单栏/Dock），转换到 AX 的左上角坐标系 ----
#[repr(C)]
#[derive(Clone, Copy)]
struct NsRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

unsafe fn visible_screens_ax() -> Vec<Rect> {
    use objc::runtime::Object;
    use objc::{class, msg_send, sel, sel_impl};

    let screens: *mut Object = msg_send![class!(NSScreen), screens];
    if screens.is_null() {
        return Vec::new();
    }
    let count: usize = msg_send![screens, count];

    // 主屏（frame.origin == (0,0)）的高度，用于把 bottom-left 翻转成 top-left
    let mut primary_h = 0.0_f64;
    for i in 0..count {
        let s: *mut Object = msg_send![screens, objectAtIndex: i];
        let f: NsRect = msg_send![s, frame];
        if f.x == 0.0 && f.y == 0.0 {
            primary_h = f.h;
        }
    }
    if primary_h == 0.0 && count > 0 {
        let s: *mut Object = msg_send![screens, objectAtIndex: 0usize];
        let f: NsRect = msg_send![s, frame];
        primary_h = f.h;
    }

    let mut out = Vec::new();
    for i in 0..count {
        let s: *mut Object = msg_send![screens, objectAtIndex: i];
        let vf: NsRect = msg_send![s, visibleFrame];
        out.push(Rect {
            x: vf.x,
            y: primary_h - (vf.y + vf.h),
            w: vf.w,
            h: vf.h,
        });
    }
    out
}

/// 找窗口中心所在屏幕的可视区域，找不到则用第一块屏。
fn screen_for(win: Rect, screens: &[Rect]) -> Option<Rect> {
    let cx = win.x + win.w / 2.0;
    let cy = win.y + win.h / 2.0;
    screens
        .iter()
        .find(|s| cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h)
        .or_else(|| screens.first())
        .copied()
}

/// 执行码放。`gap` 为窗口边距（点），是所有目标尺寸的前提。必须在主线程调用。
pub fn tile(action: TileAction, gap: f64) {
    unsafe {
        let (win, pid) = match focused_window() {
            Some(v) => v,
            None => return,
        };
        let cur = match get_frame(win) {
            Some(f) => f,
            None => return,
        };

        let target = match action {
            TileAction::Restore => {
                let saved = prev_frames().lock().ok().and_then(|m| m.get(&pid).copied());
                match saved {
                    Some(r) => r,
                    None => return, // 没有可复原的记录
                }
            }
            _ => {
                let screens = visible_screens_ax();
                let s = match screen_for(cur, &screens) {
                    Some(s) => s,
                    None => return,
                };
                let g = gap.max(0.0);
                let inner_h = (s.h - 2.0 * g).max(1.0);
                let half_w = ((s.w - 3.0 * g) / 2.0).max(1.0);
                match action {
                    TileAction::Left => Rect { x: s.x + g, y: s.y + g, w: half_w, h: inner_h },
                    TileAction::Right => Rect {
                        x: s.x + 2.0 * g + half_w,
                        y: s.y + g,
                        w: half_w,
                        h: inner_h,
                    },
                    TileAction::Maximize => Rect {
                        x: s.x + g,
                        y: s.y + g,
                        w: (s.w - 2.0 * g).max(1.0),
                        h: inner_h,
                    },
                    TileAction::Restore => unreachable!(),
                }
            }
        };

        // 码放前记录当前尺寸，供之后「复原」
        if !matches!(action, TileAction::Restore) {
            if let Ok(mut m) = prev_frames().lock() {
                m.insert(pid, cur);
            }
        }

        set_frame(win, target);
        cf_release(win);
    }
}
