import React, { useState, useRef, useEffect, useCallback } from "react";

// ── drafting-table palette ──────────────────────────────────────────────
const C = {
  void: "#0E1726",
  panel: "#16213A",
  panel2: "#1B2A47",
  line: "#2A3A5C",
  blue: "#4C9BE8",
  amber: "#E8A04C",
  green: "#5FB88A",
  rose: "#E0738C",
  text: "#C9D6EC",
  dim: "#6E83A8",
  faint: "#3A4A6B",
};
const MONO = "ui-monospace, 'SF Mono', 'Menlo', monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";

const PALETTE = [
  { s: "#4C9BE8", f: "rgba(76,155,232,0.20)" },
  { s: "#E8A04C", f: "rgba(232,160,76,0.20)" },
  { s: "#5FB88A", f: "rgba(95,184,138,0.20)" },
  { s: "#E0738C", f: "rgba(224,115,140,0.20)" },
  { s: "#9B8CE8", f: "rgba(155,140,232,0.20)" },
  { s: "#4FB8C4", f: "rgba(79,184,196,0.20)" },
  { s: "#8595B0", f: "rgba(133,149,176,0.20)" },
];

// presets in INCHES
const PRESETS = [
  { label: "Sofa", w: 84, h: 38 },
  { label: "Loveseat", w: 60, h: 38 },
  { label: "Armchair", w: 35, h: 35 },
  { label: "Sectional", w: 110, h: 84 },
  { label: "Coffee table", w: 48, h: 24 },
  { label: "Side table", w: 22, h: 22 },
  { label: "TV stand", w: 60, h: 18 },
  { label: "Bookshelf", w: 36, h: 12 },
  { label: "Dining table", w: 60, h: 36 },
  { label: "Desk", w: 48, h: 30 },
  { label: "Bed (Queen)", w: 60, h: 80 },
  { label: "Bed (King)", w: 76, h: 80 },
  { label: "Bed (Twin)", w: 38, h: 75 },
  { label: "Nightstand", w: 22, h: 18 },
  { label: "Dresser", w: 60, h: 20 },
  { label: "Rug", w: 96, h: 60 },
  { label: "Round table", w: 48, h: 48, shape: "circle" },
  { label: "Round rug", w: 84, h: 84, shape: "circle" },
  { label: "Ottoman", w: 30, h: 30, shape: "circle" },
  { label: "Custom", w: 36, h: 36 },
];

const ftIn = (inches) => {
  const total = Math.round(inches);
  const ft = Math.floor(total / 12);
  const i = total % 12;
  return `${ft}'${i}"`;
};

const HAS_STORE = typeof window !== "undefined" && !!window.storage;
const PREFIX = "plan:";
const AUTOKEY = "plan:__autosave__";
const keyFor = (name) => PREFIX + encodeURIComponent(name);

export default function FurniturePlanner() {
  const [img, setImg] = useState(null);
  const [nat, setNat] = useState(null); // {w,h} natural px
  const [zoom, setZoom] = useState(1);
  const [scale, setScale] = useState(null); // image px per foot
  const [calib, setCalib] = useState(false);
  const [pts, setPts] = useState([]); // image coords
  const [len, setLen] = useState("");
  const [lenUnit, setLenUnit] = useState("ft");
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [grid, setGrid] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  // persistence
  const [plans, setPlans] = useState([]);
  const [planName, setPlanName] = useState("");
  const [status, setStatus] = useState(null);
  const [restored, setRestored] = useState(false);

  const vpRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef(null);
  const zoomRef = useRef(zoom);
  const idRef = useRef(1);
  const colorRef = useRef(0);
  const statusTimer = useRef(null);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const selItem = items.find((i) => i.id === sel) || null;

  const flash = (text, kind = "ok") => {
    setStatus({ text, kind });
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 2600);
  };

  const fitZoom = (w, h) => {
    const vp = vpRef.current;
    if (!vp) return 1;
    const f = Math.min((vp.clientWidth - 24) / w, (vp.clientHeight - 24) / h, 1.5);
    return f > 0 ? f : 1;
  };

  // ── image loading (downscales large images so layouts stay saveable) ──
  const loadFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const MAXD = 2400;
        let dataURL = r.result, W = im.naturalWidth, H = im.naturalHeight;
        const big = Math.max(W, H);
        if (big > MAXD) {
          const k = MAXD / big;
          W = Math.round(W * k); H = Math.round(H * k);
          const cv = document.createElement("canvas");
          cv.width = W; cv.height = H;
          cv.getContext("2d").drawImage(im, 0, 0, W, H);
          dataURL = cv.toDataURL("image/jpeg", 0.9);
        }
        setNat({ w: W, h: H });
        setScale(null); setPts([]); setCalib(false); setItems([]); setSel(null);
        setRestored(false);
        setZoom(fitZoom(W, H));
        setImg(dataURL);
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  };

  // ── apply a stored / restored plan ──
  const applyState = (d) => {
    setImg(d.img); setNat(d.nat); setScale(d.scale ?? null);
    setItems(d.items || []); setGrid(d.grid ?? true);
    setSel(null); setCalib(false); setPts([]);
    const maxId = (d.items || []).reduce((m, i) => Math.max(m, i.id), 0);
    idRef.current = maxId + 1;
    colorRef.current = (d.items || []).length;
    if (d.nat) setZoom(fitZoom(d.nat.w, d.nat.h));
  };

  // ── storage helpers ──
  const refreshPlans = useCallback(async () => {
    if (!HAS_STORE) return;
    try {
      const r = await window.storage.list(PREFIX);
      const names = (r?.keys || [])
        .filter((k) => k !== AUTOKEY)
        .map((k) => decodeURIComponent(k.slice(PREFIX.length)));
      setPlans(names.sort());
    } catch { /* none yet */ }
  }, []);

  const savePlan = async () => {
    const name = planName.trim();
    if (!name || !img || !HAS_STORE) return;
    const payload = JSON.stringify({ v: 1, name, img, nat, scale, items, grid, savedAt: Date.now() });
    try {
      await window.storage.set(keyFor(name), payload, false);
      setPlanName(""); flash(`Saved "${name}"`); refreshPlans();
    } catch {
      flash("Couldn't save — the plan image may be too large.", "err");
    }
  };

  const loadPlan = async (name) => {
    if (!HAS_STORE) return;
    try {
      const r = await window.storage.get(keyFor(name));
      if (r?.value) { applyState(JSON.parse(r.value)); flash(`Loaded "${name}"`); }
    } catch { flash("Couldn't load that plan.", "err"); }
  };

  const deletePlan = async (name) => {
    if (!HAS_STORE) return;
    try { await window.storage.delete(keyFor(name)); refreshPlans(); } catch {}
  };

  const newPlan = () => {
    setImg(null); setNat(null); setScale(null); setItems([]); setSel(null);
    setCalib(false); setPts([]); setRestored(false);
    if (HAS_STORE) window.storage.delete(AUTOKEY).catch(() => {});
  };

  // ── on mount: load saved list + restore last working session ──
  useEffect(() => {
    (async () => {
      await refreshPlans();
      if (!HAS_STORE) return;
      try {
        const r = await window.storage.get(AUTOKEY);
        if (r?.value) {
          const d = JSON.parse(r.value);
          if (d.img) { applyState(d); setRestored(true); }
        }
      } catch {}
    })();
  }, [refreshPlans]);

  // ── autosave working session (debounced) ──
  useEffect(() => {
    if (!HAS_STORE || !img || !nat) return;
    const t = setTimeout(() => {
      window.storage
        .set(AUTOKEY, JSON.stringify({ v: 1, img, nat, scale, items, grid, savedAt: Date.now() }), false)
        .catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [img, nat, scale, items, grid]);

  // ── coordinate helpers ──
  const toImg = useCallback((cx, cy) => {
    const rect = contentRef.current.getBoundingClientRect();
    return { x: (cx - rect.left) / zoomRef.current, y: (cy - rect.top) / zoomRef.current };
  }, []);

  // ── drag furniture (window listeners) ──
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const c = toImg(e.clientX, e.clientY);
      setItems((prev) => prev.map((it) =>
        it.id === d.id ? { ...it, x: c.x - d.dx, y: c.y - d.dy } : it));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [toImg]);

  // ── pinch-to-zoom (two-finger), zooming toward the pinch midpoint ──
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    let pinch = null;
    const dist = (t) => Math.hypot(
      t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({
      x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    const onStart = (e) => {
      if (e.touches.length === 2) {
        dragRef.current = null; // cancel any in-progress furniture drag
        pinch = { d: dist(e.touches), z: zoomRef.current };
      }
    };
    const onMove = (e) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault(); // stop native page zoom / scroll mid-pinch
        const old = zoomRef.current;
        let nz = pinch.z * (dist(e.touches) / pinch.d);
        nz = Math.max(0.1, Math.min(nz, 10));
        const rect = vp.getBoundingClientRect();
        const m = mid(e.touches);
        const sx = m.x - rect.left, sy = m.y - rect.top;
        const cx = (vp.scrollLeft + sx) / old; // content point under fingers
        const cy = (vp.scrollTop + sy) / old;
        setZoom(nz);
        requestAnimationFrame(() => {
          vp.scrollLeft = cx * nz - sx;
          vp.scrollTop = cy * nz - sy;
        });
      }
    };
    const onEnd = (e) => { if (e.touches.length < 2) pinch = null; };

    // macOS trackpad pinch arrives as a ctrl-flagged wheel event
    const onWheel = (e) => {
      if (!e.ctrlKey) return; // plain scroll still pans natively
      e.preventDefault();
      const old = zoomRef.current;
      let nz = old * Math.exp(-e.deltaY * 0.01);
      nz = Math.max(0.1, Math.min(nz, 10));
      const rect = vp.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const cx = (vp.scrollLeft + sx) / old; // content point under cursor
      const cy = (vp.scrollTop + sy) / old;
      setZoom(nz);
      requestAnimationFrame(() => {
        vp.scrollLeft = cx * nz - sx;
        vp.scrollTop = cy * nz - sy;
      });
    };

    vp.addEventListener("touchstart", onStart, { passive: false });
    vp.addEventListener("touchmove", onMove, { passive: false });
    vp.addEventListener("touchend", onEnd);
    vp.addEventListener("touchcancel", onEnd);
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      vp.removeEventListener("touchstart", onStart);
      vp.removeEventListener("touchmove", onMove);
      vp.removeEventListener("touchend", onEnd);
      vp.removeEventListener("touchcancel", onEnd);
      vp.removeEventListener("wheel", onWheel);
    };
  }, []);

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setCalib(false); setPts([]); setSel(null); setEditing(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && sel != null) {
        const t = e.target.tagName;
        if (t !== "INPUT" && t !== "TEXTAREA") {
          e.preventDefault();
          setItems((p) => p.filter((i) => i.id !== sel));
          setSel(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  // ── calibration ──
  const onCanvasDown = (e) => {
    if (calib) {
      const c = toImg(e.clientX, e.clientY);
      setPts((p) => (p.length >= 2 ? [c] : [...p, c]));
    } else if (e.target === contentRef.current || e.target.dataset.bg) {
      setSel(null); setEditing(null);
    }
  };

  const applyScale = () => {
    if (pts.length < 2) return;
    const v = parseFloat(len);
    if (!v || v <= 0) return;
    const feet = lenUnit === "in" ? v / 12 : v;
    const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
    const px = Math.sqrt(dx * dx + dy * dy);
    setScale(px / feet);
    setCalib(false); setPts([]); setLen("");
  };

  // ── furniture ──
  const addItem = (preset) => {
    if (!scale) return;
    const id = idRef.current++;
    const ci = colorRef.current++ % PALETTE.length;
    const wpx = (preset.w / 12) * scale, hpx = (preset.h / 12) * scale;
    const cx = nat.w / 2 - wpx / 2 + ((items.length % 6) * 14);
    const cy = nat.h / 2 - hpx / 2 + ((items.length % 6) * 14);
    setItems((p) => [...p, {
      id, label: preset.label, wIn: preset.w, hIn: preset.h, shape: preset.shape || "rect",
      x: cx, y: cy, rot: 0, ci,
    }]);
    setSel(id);
  };

  const updateSel = (patch) =>
    setItems((p) => p.map((i) => (i.id === sel ? { ...i, ...patch } : i)));

  const itemDown = (e, it) => {
    if (calib) return;
    e.stopPropagation();
    setSel(it.id);
    if (editing !== it.id) setEditing(null);
    const c = toImg(e.clientX, e.clientY);
    dragRef.current = { id: it.id, dx: c.x - it.x, dy: c.y - it.y };
  };

  const dupSel = () => {
    if (!selItem) return;
    const id = idRef.current++;
    setItems((p) => [...p, { ...selItem, id, x: selItem.x + 20, y: selItem.y + 20 }]);
    setSel(id);
  };

  // ── export PNG ──
  const exportPNG = () => {
    if (!img || !nat) return;
    const cv = document.createElement("canvas");
    cv.width = nat.w; cv.height = nat.h;
    const ctx = cv.getContext("2d");
    const im = new Image();
    im.onload = () => {
      ctx.drawImage(im, 0, 0, nat.w, nat.h);
      items.forEach((it) => {
        const w = (it.wIn / 12) * scale, h = (it.hIn / 12) * scale;
        const p = PALETTE[it.ci];
        ctx.save();
        ctx.translate(it.x + w / 2, it.y + h / 2);
        ctx.rotate((it.rot * Math.PI) / 180);
        ctx.fillStyle = p.f.replace("0.20", "0.55");
        ctx.lineWidth = Math.max(1.5, scale * 0.04);
        ctx.strokeStyle = p.s;
        if (it.shape === "circle") {
          ctx.beginPath();
          ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        }
        ctx.fillStyle = "#0E1726";
        const fs = Math.max(9, Math.min(scale * 0.4, h * 0.3, 22));
        ctx.font = `600 ${fs}px ${SANS}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(it.label, 0, 0);
        ctx.restore();
      });
      const link = document.createElement("a");
      link.download = "furniture-layout.png";
      link.href = cv.toDataURL("image/png");
      link.click();
    };
    im.src = img;
  };

  // ── derived render values ──
  const cw = nat ? nat.w * zoom : 0;
  const ch = nat ? nat.h * zoom : 0;
  const gridStep = scale ? scale * zoom : 0; // 1 ft in display px

  const btn = (extra = {}) => ({
    fontFamily: SANS, fontSize: 12, color: C.text, background: C.panel2,
    border: `1px solid ${C.line}`, borderRadius: 6, padding: "7px 10px",
    cursor: "pointer", ...extra,
  });
  const secLabel = {
    fontFamily: MONO, fontSize: 11, color: C.dim, textTransform: "uppercase",
    letterSpacing: 1.5, marginBottom: 8,
  };

  return (
    <div style={{ fontFamily: SANS, background: C.void, color: C.text, display: "flex",
      flexDirection: "column", height: "100vh", minHeight: 560, overflow: "hidden" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 16, letterSpacing: 1, color: C.blue }}>⌖ PLANSET</span>
          <span style={{ fontSize: 12, color: C.dim }}>floor-plan furniture layout</span>
        </div>
        {status && (
          <span style={{ fontSize: 12, fontFamily: MONO,
            color: status.kind === "err" ? C.rose : C.green }}>{status.text}</span>
        )}
        <div style={{ flex: 1 }} />
        {img && <button style={btn()} onClick={newPlan}>New</button>}
        <label style={btn({ background: C.blue, color: C.void, fontWeight: 600, border: "none" })}>
          {img ? "Replace plan" : "Upload plan"}
          <input type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => loadFile(e.target.files[0])} />
        </label>
        {img && <button style={btn()} onClick={exportPNG}>Save layout PNG</button>}
      </div>

      {restored && img && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px",
          background: C.panel2, borderBottom: `1px solid ${C.line}`, fontSize: 12 }}>
          <span style={{ color: C.green }}>↻ Restored your last session.</span>
          <div style={{ flex: 1 }} />
          <button style={btn({ padding: "4px 9px" })} onClick={() => setRestored(false)}>Keep</button>
          <button style={btn({ padding: "4px 9px" })} onClick={newPlan}>Start new</button>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* left tool rail */}
        <div style={{ width: 232, borderRight: `1px solid ${C.line}`, background: C.panel,
          overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* scale block */}
          <div>
            <div style={secLabel}>1 · Set the scale</div>
            {scale ? (
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                <span style={{ color: C.amber, fontFamily: MONO }}>{scale.toFixed(1)} px / ft</span><br />
                <button style={btn({ marginTop: 8, width: "100%" })}
                  onClick={() => { setCalib(true); setPts([]); }}>Recalibrate</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
                Trace one known length (a wall, a door) so furniture sizes correctly.
                <button disabled={!img} style={btn({ marginTop: 8, width: "100%",
                  opacity: img ? 1 : 0.4, cursor: img ? "pointer" : "not-allowed" })}
                  onClick={() => { setCalib(true); setPts([]); }}>
                  {calib ? "Click 2 points…" : "Set scale"}
                </button>
              </div>
            )}
            {calib && (
              <div style={{ marginTop: 10, padding: 10, background: C.panel2,
                border: `1px solid ${C.amber}`, borderRadius: 6, fontSize: 12 }}>
                <div style={{ color: C.dim, marginBottom: 6 }}>
                  {pts.length === 0 && "Click the start point on the plan."}
                  {pts.length === 1 && "Click the end point."}
                  {pts.length === 2 && "Enter the real length:"}
                </div>
                {pts.length === 2 && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" value={len} autoFocus
                      onChange={(e) => setLen(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && applyScale()}
                      style={{ width: "100%", background: C.void, color: C.text, boxSizing: "border-box",
                        border: `1px solid ${C.line}`, borderRadius: 4, padding: "6px 8px", fontFamily: MONO }} />
                    <select value={lenUnit} onChange={(e) => setLenUnit(e.target.value)}
                      style={{ background: C.void, color: C.text, border: `1px solid ${C.line}`, borderRadius: 4 }}>
                      <option value="ft">ft</option>
                      <option value="in">in</option>
                    </select>
                  </div>
                )}
                {pts.length === 2 && (
                  <button style={btn({ marginTop: 8, width: "100%", background: C.amber,
                    color: C.void, fontWeight: 600, border: "none" })} onClick={applyScale}>Apply scale</button>
                )}
              </div>
            )}
          </div>

          {/* furniture block */}
          <div>
            <div style={secLabel}>2 · Add furniture</div>
            {!scale && <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>Set the scale first ↑</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
              opacity: scale ? 1 : 0.4, pointerEvents: scale ? "auto" : "none" }}>
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => addItem(p)} title={`${ftIn(p.w)} × ${ftIn(p.h)}`}
                  style={btn({ padding: "6px 6px", fontSize: 11, textAlign: "left", lineHeight: 1.2 })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* view options */}
          <div>
            <div style={secLabel}>View</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button style={btn({ flex: 1 })} onClick={() => setZoom((z) => z * 0.85)}>−</button>
              <span style={{ fontFamily: MONO, fontSize: 12, minWidth: 44, textAlign: "center" }}>
                {Math.round(zoom * 100)}%</span>
              <button style={btn({ flex: 1 })} onClick={() => setZoom((z) => z * 1.18)}>+</button>
            </div>
            <button style={btn({ marginTop: 6, width: "100%", borderColor: grid ? C.blue : C.line })}
              onClick={() => setGrid((g) => !g)}>{grid ? "✓ " : ""}1-ft grid</button>
          </div>

          {/* saved plans */}
          {HAS_STORE && (
            <div>
              <div style={secLabel}>Saved plans</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={planName} placeholder="Plan name"
                  onChange={(e) => setPlanName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && savePlan()}
                  style={{ width: "100%", background: C.void, color: C.text, boxSizing: "border-box",
                    border: `1px solid ${C.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12 }} />
                <button disabled={!img || !planName.trim()}
                  style={btn({ opacity: img && planName.trim() ? 1 : 0.4 })}
                  onClick={savePlan}>Save</button>
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {plans.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.faint }}>No saved plans yet.</div>
                ) : plans.map((n) => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 6,
                    background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 5, padding: "5px 8px" }}>
                    <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", cursor: "pointer" }} title={`Load ${n}`}
                      onClick={() => loadPlan(n)}>{n}</span>
                    <span style={{ fontSize: 11, color: C.blue, cursor: "pointer" }}
                      onClick={() => loadPlan(n)}>Load</span>
                    <span style={{ fontSize: 13, color: C.dim, cursor: "pointer" }}
                      title="Delete" onClick={() => deletePlan(n)}>✕</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* canvas viewport */}
        <div ref={vpRef} style={{ flex: 1, overflow: "auto", position: "relative", touchAction: "pan-x pan-y",
          background: `repeating-linear-gradient(0deg, ${C.void}, ${C.void} 23px, #131d31 24px),
            repeating-linear-gradient(90deg, ${C.void}, ${C.void} 23px, #131d31 24px)` }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}>

          {!img ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", padding: 24 }}>
              <label style={{ border: `2px dashed ${dragOver ? C.blue : C.line}`, borderRadius: 12,
                padding: "48px 56px", textAlign: "center", cursor: "pointer",
                background: dragOver ? "rgba(76,155,232,0.06)" : "transparent", maxWidth: 420 }}>
                <div style={{ fontSize: 34, marginBottom: 12 }}>▦</div>
                <div style={{ fontSize: 15, marginBottom: 6 }}>Drop a floor-plan image here</div>
                <div style={{ fontSize: 12, color: C.dim }}>or click to browse · PNG, JPG, etc.</div>
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => loadFile(e.target.files[0])} />
              </label>
            </div>
          ) : (
            <div ref={contentRef} data-bg="1" onPointerDown={onCanvasDown}
              style={{ position: "relative", width: cw, height: ch, margin: 12,
                cursor: calib ? "crosshair" : "default", boxShadow: "0 0 0 1px " + C.line }}>
              <img src={img} alt="floor plan" data-bg="1" draggable={false}
                style={{ width: "100%", height: "100%", display: "block", userSelect: "none" }} />

              {grid && scale && gridStep > 6 && (
                <svg width={cw} height={ch} data-bg="1" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  <defs>
                    <pattern id="g" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
                      <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none"
                        stroke={C.blue} strokeWidth="0.5" opacity="0.28" />
                    </pattern>
                  </defs>
                  <rect width={cw} height={ch} fill="url(#g)" />
                </svg>
              )}

              {items.map((it) => {
                const w = (it.wIn / 12) * scale * zoom;
                const h = (it.hIn / 12) * scale * zoom;
                const p = PALETTE[it.ci];
                const isSel = it.id === sel;
                const mind = Math.min(w, h);
                return (
                  <div key={it.id} onPointerDown={(e) => itemDown(e, it)}
                    onDoubleClick={(e) => { if (calib) return; e.stopPropagation();
                      setSel(it.id); setEditing(it.id); }}
                    style={{ position: "absolute", left: it.x * zoom, top: it.y * zoom,
                      width: w, height: h, transform: `rotate(${it.rot}deg)`, transformOrigin: "center",
                      background: p.f, border: `${isSel ? 2 : 1.5}px solid ${isSel ? C.amber : p.s}`,
                      boxShadow: isSel ? `0 0 0 2px ${C.amber}55` : "none",
                      borderRadius: it.shape === "circle" ? "50%" : 0,
                      cursor: calib ? "crosshair" : "move", display: "flex", alignItems: "center",
                      justifyContent: "center", boxSizing: "border-box", touchAction: "none" }}>
                    {/* counter-rotate so the label stays upright and readable */}
                    <div style={{ transform: `rotate(${-it.rot}deg)`, maxWidth: "94%",
                      display: "flex", justifyContent: "center" }}>
                      {editing === it.id ? (
                        <input autoFocus value={it.label}
                          onChange={(e) => updateSel({ label: e.target.value })}
                          onPointerDown={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onBlur={() => setEditing(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditing(null); }
                          }}
                          style={{ width: 120, maxWidth: "100%", textAlign: "center", fontSize: 12,
                            fontFamily: SANS, color: C.text, background: "#0B1220",
                            border: `1px solid ${C.amber}`, borderRadius: 5, padding: "3px 6px",
                            boxSizing: "border-box" }} />
                      ) : (
                        mind > 24 && (
                          <div style={{ textAlign: "center", lineHeight: 1.15, pointerEvents: "none",
                            textShadow: "0 0 3px rgba(255,255,255,0.95), 0 0 2px rgba(255,255,255,0.95)" }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: "#000000",
                              whiteSpace: "normal", wordBreak: "break-word" }}>{it.label}</div>
                            {mind > 40 && (
                              <div style={{ fontFamily: MONO, fontSize: 8, color: "#111111", marginTop: 1 }}>
                                {ftIn(it.wIn)} × {ftIn(it.hIn)}</div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}

              {(calib || pts.length > 0) && (
                <svg width={cw} height={ch} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {pts.length === 2 && (
                    <line x1={pts[0].x * zoom} y1={pts[0].y * zoom} x2={pts[1].x * zoom} y2={pts[1].y * zoom}
                      stroke={C.amber} strokeWidth="2" />
                  )}
                  {pts.map((pt, i) => (
                    <g key={i}>
                      <circle cx={pt.x * zoom} cy={pt.y * zoom} r="5" fill={C.amber} />
                      <circle cx={pt.x * zoom} cy={pt.y * zoom} r="9" fill="none" stroke={C.amber}
                        strokeWidth="1.5" opacity="0.5" />
                    </g>
                  ))}
                </svg>
              )}
            </div>
          )}
        </div>

        {/* right inspector */}
        {selItem && (
          <div style={{ width: 220, borderLeft: `1px solid ${C.line}`, background: C.panel,
            padding: 14, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            <div style={secLabel}>Selected piece</div>
            <input value={selItem.label} onChange={(e) => updateSel({ label: e.target.value })}
              style={{ background: C.void, color: C.text, border: `1px solid ${C.line}`,
                borderRadius: 5, padding: "7px 9px", fontSize: 13, fontFamily: SANS, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              {[["wIn", "Width"], ["hIn", "Depth"]].map(([k, lbl]) => (
                <div key={k} style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>{lbl} (in)</div>
                  <input type="number" value={selItem[k]}
                    onChange={(e) => updateSel({ [k]: Math.max(1, parseFloat(e.target.value) || 0) })}
                    style={{ width: "100%", background: C.void, color: C.text, boxSizing: "border-box",
                      border: `1px solid ${C.line}`, borderRadius: 5, padding: "6px 8px", fontFamily: MONO, fontSize: 12 }} />
                </div>
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.amber }}>
              {ftIn(selItem.wIn)} × {ftIn(selItem.hIn)}</div>
            <div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 5 }}>Shape</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["rect", "Rectangle"], ["circle", "Circle"]].map(([s, lbl]) => (
                  <button key={s} onClick={() => updateSel({ shape: s })}
                    style={btn({ flex: 1, borderColor: (selItem.shape || "rect") === s ? C.blue : C.line,
                      color: (selItem.shape || "rect") === s ? C.blue : C.text })}>{lbl}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 5 }}>Rotation · {selItem.rot}°</div>
              <input type="range" min="0" max="359" value={selItem.rot}
                onChange={(e) => updateSel({ rot: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: C.blue }} />
              <button style={btn({ marginTop: 6, width: "100%" })}
                onClick={() => updateSel({ rot: (selItem.rot + 90) % 360 })}>Rotate 90°</button>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 5 }}>Color</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PALETTE.map((p, i) => (
                  <div key={i} onClick={() => updateSel({ ci: i })}
                    style={{ width: 22, height: 22, borderRadius: 5, background: p.s, cursor: "pointer",
                      border: selItem.ci === i ? `2px solid ${C.text}` : `2px solid transparent` }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
              <button style={btn({ flex: 1 })} onClick={dupSel}>Duplicate</button>
              <button style={btn({ flex: 1, color: "#E0738C", borderColor: "#5e3340" })}
                onClick={() => { setItems((p) => p.filter((i) => i.id !== sel)); setSel(null); }}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
