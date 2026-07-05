import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  HAS_STORE, AUTOSAVE_ID, SCHEMA_VERSION, uid,
  putLayout, getLayout, deleteLayout, listLayouts,
} from "./layoutStore.js";

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

  // ── measurements ──
  const [measuring, setMeasuring] = useState(false);
  const [measurePts, setMeasurePts] = useState([]); // image coords, 0-2 while placing
  const [hoverPt, setHoverPt] = useState(null); // rubber-band target while placing
  const [measures, setMeasures] = useState([]); // saved measurement objects
  const [selMeasure, setSelMeasure] = useState(null);
  const [measureName, setMeasureName] = useState("");

  // persistence
  const [plans, setPlans] = useState([]);        // saved layout records (metadata + data)
  const [planName, setPlanName] = useState("");  // "Save as" name field
  const [currentId, setCurrentId] = useState(null);   // id of the layout being edited
  const [currentName, setCurrentName] = useState(""); // its name (for the header)
  const [status, setStatus] = useState(null);
  const [restored, setRestored] = useState(false);
  const importRef = useRef(null);

  const vpRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef(null);
  const measureDragRef = useRef(null); // { id, end: "a" | "b" }
  const zoomRef = useRef(zoom);
  const idRef = useRef(1);
  const mIdRef = useRef(1);
  const colorRef = useRef(0);
  const statusTimer = useRef(null);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const selItem = items.find((i) => i.id === sel) || null;
  const selIndex = selItem ? items.findIndex((i) => i.id === sel) : -1;
  const atFront = selIndex === items.length - 1; // last drawn → on top
  const atBack = selIndex === 0;
  const selMeasureObj = measures.find((m) => m.id === selMeasure) || null;

  // distance in feet between two image-coord points, given the current scale
  const distFt = (a, b) => (scale ? Math.hypot(b.x - a.x, b.y - a.y) / scale : 0);

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
        setMeasures([]); setMeasuring(false); setMeasurePts([]); setSelMeasure(null);
        setRestored(false); setCurrentId(null); setCurrentName("");
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
    setMeasures(d.measures || []);
    setSel(null); setCalib(false); setPts([]);
    setMeasuring(false); setMeasurePts([]); setSelMeasure(null);
    const maxId = (d.items || []).reduce((m, i) => Math.max(m, i.id), 0);
    idRef.current = maxId + 1;
    const maxMId = (d.measures || []).reduce((m, x) => Math.max(m, x.id), 0);
    mIdRef.current = maxMId + 1;
    colorRef.current = (d.items || []).length;
    if (d.nat) setZoom(fitZoom(d.nat.w, d.nat.h));
  };

  // ── storage helpers (IndexedDB-backed) ──
  const refreshPlans = useCallback(async () => {
    if (!HAS_STORE) return;
    try { setPlans(await listLayouts()); } catch { /* none yet */ }
  }, []);

  // snapshot of everything that makes up a layout
  const snapshot = () => ({ img, nat, scale, items, measures, grid });

  // write one named layout record and mark it as the one being edited
  const writeLayout = async (id, name) => {
    const record = { id, name, ...snapshot(), v: SCHEMA_VERSION, savedAt: Date.now() };
    try {
      await putLayout(record);
      setCurrentId(id); setCurrentName(name);
      await refreshPlans();
      return true;
    } catch {
      flash("Couldn't save — storage may be full.", "err");
      return false;
    }
  };

  // "Save" — update the layout currently open for editing (in place)
  const saveCurrent = async () => {
    if (!img || !HAS_STORE || !currentId) return;
    if (await writeLayout(currentId, currentName)) flash(`Saved "${currentName}"`);
  };

  // "Save as" / first save — create a new named layout (confirm on name clash)
  const saveAs = async () => {
    const name = planName.trim();
    if (!name || !img || !HAS_STORE) return;
    const clash = plans.find((p) => p.name === name && p.id !== currentId);
    if (clash && !window.confirm(`A layout named "${name}" already exists. Overwrite it?`)) return;
    const id = clash ? clash.id : uid();
    if (await writeLayout(id, name)) { setPlanName(""); flash(`Saved "${name}"`); }
  };

  const loadPlan = async (id) => {
    if (!HAS_STORE) return;
    try {
      const r = await getLayout(id);
      if (r?.img) {
        applyState(r);
        setCurrentId(r.id); setCurrentName(r.name || "");
        setRestored(false); flash(`Loaded "${r.name}"`);
      }
    } catch { flash("Couldn't load that layout.", "err"); }
  };

  const deletePlan = async (id, name) => {
    if (!HAS_STORE) return;
    if (!window.confirm(`Delete saved layout "${name}"? This can't be undone.`)) return;
    try {
      await deleteLayout(id);
      if (currentId === id) { setCurrentId(null); setCurrentName(""); }
      refreshPlans();
    } catch {}
  };

  const newPlan = () => {
    setImg(null); setNat(null); setScale(null); setItems([]); setSel(null);
    setCalib(false); setPts([]); setRestored(false);
    setMeasures([]); setMeasuring(false); setMeasurePts([]); setSelMeasure(null);
    setCurrentId(null); setCurrentName(""); setPlanName("");
    if (HAS_STORE) deleteLayout(AUTOSAVE_ID).catch(() => {});
  };

  // ── export the current layout to a .json file ──
  const exportLayout = () => {
    if (!img) return;
    const name = (currentName || planName.trim() || "layout");
    const data = { app: "furniture-planner", name, ...snapshot(), v: SCHEMA_VERSION, savedAt: Date.now() };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${name.replace(/[^\w.-]+/g, "_")}.layout.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── import a layout from a .json file ──
  const importLayout = async (file) => {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !d.img) throw new Error("bad file");
      applyState(d);
      const base = (d.name || file.name.replace(/\.layout\.json$|\.json$/i, "") || "Imported");
      const taken = new Set(plans.map((p) => p.name));
      let name = base, n = 2;
      while (taken.has(name)) name = `${base} (${n++})`;
      if (HAS_STORE) {
        const id = uid();
        if (await writeLayout(id, name)) flash(`Imported "${name}"`);
      } else {
        setCurrentId(null); setCurrentName(name); flash(`Imported "${name}"`);
      }
    } catch {
      flash("That doesn't look like a layout file.", "err");
    }
  };

  // ── on mount: load saved list + restore last working session ──
  useEffect(() => {
    (async () => {
      await refreshPlans();
      if (!HAS_STORE) return;
      try {
        const d = await getLayout(AUTOSAVE_ID);
        if (d?.img) {
          applyState(d);
          setCurrentId(d.currentId ?? null);
          setCurrentName(d.currentName ?? "");
          setRestored(true);
        }
      } catch {}
    })();
  }, [refreshPlans]);

  // ── autosave working session (debounced) ──
  useEffect(() => {
    if (!HAS_STORE || !img || !nat) return;
    const t = setTimeout(() => {
      putLayout({ id: AUTOSAVE_ID, ...snapshot(), currentId, currentName,
        v: SCHEMA_VERSION, savedAt: Date.now() }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [img, nat, scale, items, measures, grid, currentId, currentName]);

  // ── coordinate helpers ──
  const toImg = useCallback((cx, cy) => {
    const rect = contentRef.current.getBoundingClientRect();
    return { x: (cx - rect.left) / zoomRef.current, y: (cy - rect.top) / zoomRef.current };
  }, []);

  // ── drag furniture (window listeners) ──
  useEffect(() => {
    const move = (e) => {
      const md = measureDragRef.current;
      if (md) {
        const c = toImg(e.clientX, e.clientY);
        setMeasures((prev) => prev.map((m) =>
          m.id === md.id ? { ...m, [md.end + "x"]: c.x, [md.end + "y"]: c.y } : m));
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const c = toImg(e.clientX, e.clientY);
      setItems((prev) => prev.map((it) =>
        it.id === d.id ? { ...it, x: c.x - d.dx, y: c.y - d.dy } : it));
    };
    const up = () => { dragRef.current = null; measureDragRef.current = null; };
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
      if (e.key === "Escape") {
        setCalib(false); setPts([]); setSel(null); setEditing(null);
        setMeasuring(false); setMeasurePts([]); setSelMeasure(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const t = e.target.tagName;
        if (t === "INPUT" || t === "TEXTAREA") return;
        if (sel != null) {
          e.preventDefault();
          setItems((p) => p.filter((i) => i.id !== sel));
          setSel(null);
        } else if (selMeasure != null) {
          e.preventDefault();
          setMeasures((p) => p.filter((m) => m.id !== selMeasure));
          setSelMeasure(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, selMeasure]);

  // ── calibration ──
  const onCanvasDown = (e) => {
    if (calib) {
      const c = toImg(e.clientX, e.clientY);
      setPts((p) => (p.length >= 2 ? [c] : [...p, c]));
    } else if (measuring) {
      const c = toImg(e.clientX, e.clientY);
      setMeasurePts((p) => (p.length >= 2 ? [c] : [...p, c]));
    } else if (e.target === contentRef.current || e.target.dataset.bg) {
      setSel(null); setEditing(null); setSelMeasure(null);
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

  // ── layer ordering ──
  // Stacking order is array order: later items render on top (and are drawn last
  // in the PNG export). Reordering the selected piece is just moving it within
  // the `items` array — "front"/"up" push it toward the end (on top).
  const reorderSel = (mode) => {
    setItems((p) => {
      const i = p.findIndex((it) => it.id === sel);
      if (i === -1) return p;
      let j;
      if (mode === "front") j = p.length - 1;
      else if (mode === "back") j = 0;
      else if (mode === "up") j = i + 1;
      else if (mode === "down") j = i - 1;
      else return p;
      if (j < 0 || j > p.length - 1 || j === i) return p;
      const next = p.slice();
      const [it] = next.splice(i, 1);
      next.splice(j, 0, it);
      return next;
    });
  };

  // ── measurements ──
  const startMeasure = () => {
    if (!scale) return;
    setMeasuring(true); setMeasurePts([]); setHoverPt(null);
    setCalib(false); setPts([]); setSel(null); setEditing(null); setSelMeasure(null);
  };

  const stopMeasure = () => {
    setMeasuring(false); setMeasurePts([]); setHoverPt(null); setMeasureName("");
  };

  const saveMeasure = () => {
    if (measurePts.length < 2) return;
    const id = mIdRef.current++;
    const [a, b] = measurePts;
    setMeasures((p) => [...p, {
      id, name: measureName.trim(), ax: a.x, ay: a.y, bx: b.x, by: b.y,
    }]);
    setMeasurePts([]); setHoverPt(null); setMeasureName("");
    setSelMeasure(id);
  };

  const measureEndDown = (e, m, end) => {
    if (calib || measuring) return;
    e.stopPropagation();
    setSel(null); setSelMeasure(m.id);
    measureDragRef.current = { id: m.id, end };
  };

  const selectMeasure = (e, m) => {
    if (calib || measuring) return;
    e.stopPropagation();
    setSel(null); setEditing(null); setSelMeasure(m.id);
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
      // measurements
      measures.forEach((m) => {
        const a = { x: m.ax, y: m.ay }, b = { x: m.bx, y: m.by };
        const label = `${m.name ? m.name + "  " : ""}${ftIn(distFt(a, b) * 12)}`;
        ctx.save();
        ctx.strokeStyle = C.green;
        ctx.fillStyle = C.green;
        ctx.lineWidth = Math.max(1.5, scale * 0.04);
        ctx.setLineDash([Math.max(4, scale * 0.14), Math.max(3, scale * 0.1)]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        const r = Math.max(2.5, scale * 0.05);
        [a, b].forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); });
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const fs = Math.max(11, Math.min(scale * 0.42, 26));
        ctx.font = `600 ${fs}px ${MONO}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(14,23,38,0.88)";
        ctx.fillRect(mx - tw / 2 - 6, my - fs / 2 - 4, tw + 12, fs + 8);
        ctx.fillStyle = C.green;
        ctx.fillText(label, mx, my);
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

          {/* measure block */}
          <div>
            <div style={secLabel}>3 · Measure</div>
            {!scale ? (
              <div style={{ fontSize: 11, color: C.faint }}>Set the scale first ↑</div>
            ) : !measuring ? (
              <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
                Click two points on the plan to measure the distance between them.
                <button style={btn({ marginTop: 8, width: "100%" })} onClick={startMeasure}>
                  Measure distance
                </button>
              </div>
            ) : (
              <div style={{ padding: 10, background: C.panel2,
                border: `1px solid ${C.green}`, borderRadius: 6, fontSize: 12 }}>
                <div style={{ color: C.dim, marginBottom: 8 }}>
                  {measurePts.length === 0 && "Click the first point on the plan."}
                  {measurePts.length === 1 && "Click the second point."}
                  {measurePts.length === 2 && "Distance:"}
                </div>
                {measurePts.length === 2 && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 18, color: C.green, marginBottom: 8 }}>
                      {ftIn(distFt(measurePts[0], measurePts[1]) * 12)}
                    </div>
                    <input value={measureName} placeholder="Name (optional)"
                      onChange={(e) => setMeasureName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveMeasure()}
                      style={{ width: "100%", background: C.void, color: C.text, boxSizing: "border-box",
                        border: `1px solid ${C.line}`, borderRadius: 4, padding: "6px 8px",
                        fontSize: 12, marginBottom: 8 }} />
                    <button style={btn({ width: "100%", background: C.green, color: C.void,
                      fontWeight: 600, border: "none", marginBottom: 6 })} onClick={saveMeasure}>
                      Save measurement
                    </button>
                  </>
                )}
                <button style={btn({ width: "100%" })} onClick={stopMeasure}>Done measuring</button>
              </div>
            )}
            {measures.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                {measures.map((m) => (
                  <div key={m.id} onClick={() => { setSel(null); setSelMeasure(m.id); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                      background: selMeasure === m.id ? C.panel2 : "transparent",
                      border: `1px solid ${selMeasure === m.id ? C.green : C.line}`,
                      borderRadius: 5, padding: "5px 8px" }}>
                    <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap" }}>
                      {m.name || "Measurement"}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.green }}>
                      {ftIn(distFt({ x: m.ax, y: m.ay }, { x: m.bx, y: m.by }) * 12)}
                    </span>
                    <span style={{ fontSize: 12, color: C.dim }} title="Delete"
                      onClick={(e) => { e.stopPropagation();
                        setMeasures((p) => p.filter((x) => x.id !== m.id));
                        if (selMeasure === m.id) setSelMeasure(null); }}>✕</span>
                  </div>
                ))}
              </div>
            )}
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

          {/* saved layouts */}
          <div>
            <div style={secLabel}>Saved layouts</div>

            {/* what's currently being edited */}
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, lineHeight: 1.4 }}>
              {currentId
                ? <>Editing <span style={{ color: C.blue }}>{currentName}</span></>
                : img ? "Unsaved layout" : "Upload a plan to begin"}
            </div>

            {/* update the open layout in place */}
            {currentId && (
              <button disabled={!img} style={btn({ width: "100%", marginBottom: 6,
                background: C.blue, color: C.void, fontWeight: 600, border: "none",
                opacity: img ? 1 : 0.4 })} onClick={saveCurrent}>
                Save changes
              </button>
            )}

            {/* save as a new named layout */}
            {HAS_STORE && (
              <div style={{ display: "flex", gap: 6 }}>
                <input value={planName} placeholder={currentId ? "Save as new name…" : "Layout name"}
                  onChange={(e) => setPlanName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveAs()}
                  style={{ width: "100%", background: C.void, color: C.text, boxSizing: "border-box",
                    border: `1px solid ${C.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12 }} />
                <button disabled={!img || !planName.trim()}
                  style={btn({ opacity: img && planName.trim() ? 1 : 0.4 })}
                  onClick={saveAs}>{currentId ? "Save as" : "Save"}</button>
              </div>
            )}

            {/* export / import */}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button disabled={!img} style={btn({ flex: 1, fontSize: 11,
                opacity: img ? 1 : 0.4 })} onClick={exportLayout}>Export file</button>
              <button style={btn({ flex: 1, fontSize: 11 })}
                onClick={() => importRef.current?.click()}>Import file</button>
              <input ref={importRef} type="file" accept="application/json,.json" style={{ display: "none" }}
                onChange={(e) => { importLayout(e.target.files[0]); e.target.value = ""; }} />
            </div>

            {HAS_STORE ? (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {plans.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.faint }}>No saved layouts yet.</div>
                ) : plans.map((p) => {
                  const isCur = p.id === currentId;
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6,
                      background: isCur ? C.panel2 : C.panel2,
                      border: `1px solid ${isCur ? C.blue : C.line}`, borderRadius: 5, padding: "5px 8px" }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} title={`Load ${p.name}`}
                        onClick={() => loadPlan(p.id)}>
                        <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", color: isCur ? C.blue : C.text }}>{p.name}</div>
                        {p.savedAt && (
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim }}>
                            {new Date(p.savedAt).toLocaleString([], { month: "short", day: "numeric",
                              hour: "numeric", minute: "2-digit" })}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: C.blue, cursor: "pointer" }}
                        onClick={() => loadPlan(p.id)}>Load</span>
                      <span style={{ fontSize: 13, color: C.dim, cursor: "pointer" }}
                        title="Delete" onClick={() => deletePlan(p.id, p.name)}>✕</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
                This browser can't store layouts here, but you can still Export a
                layout to a file and Import it later.
              </div>
            )}
          </div>
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
              onPointerMove={(e) => {
                if (measuring && measurePts.length === 1) setHoverPt(toImg(e.clientX, e.clientY));
              }}
              style={{ position: "relative", width: cw, height: ch, margin: 12,
                cursor: calib || measuring ? "crosshair" : "default", boxShadow: "0 0 0 1px " + C.line }}>
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

              {scale && (measures.length > 0 || measurePts.length > 0) && (
                <svg width={cw} height={ch} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {/* saved measurements */}
                  {measures.map((m) => {
                    const a = { x: m.ax * zoom, y: m.ay * zoom };
                    const b = { x: m.bx * zoom, y: m.by * zoom };
                    const isSel = m.id === selMeasure;
                    const col = isSel ? C.amber : C.green;
                    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                    const label = `${m.name ? m.name + "  " : ""}${ftIn(distFt({ x: m.ax, y: m.ay }, { x: m.bx, y: m.by }) * 12)}`;
                    const boxW = label.length * 7.2 + 14, boxH = 20;
                    return (
                      <g key={m.id}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="14"
                          style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onPointerDown={(e) => selectMeasure(e, m)} />
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col}
                          strokeWidth={isSel ? 2.5 : 2} strokeDasharray="6 4" />
                        {[["a", a], ["b", b]].map(([end, p]) => (
                          <circle key={end} cx={p.x} cy={p.y} r={isSel ? 7 : 5} fill={col}
                            stroke={C.void} strokeWidth="1.5"
                            style={{ pointerEvents: "all", cursor: isSel ? "grab" : "pointer", touchAction: "none" }}
                            onPointerDown={(e) => (isSel ? measureEndDown(e, m, end) : selectMeasure(e, m))} />
                        ))}
                        <g onPointerDown={(e) => selectMeasure(e, m)}
                          style={{ pointerEvents: "all", cursor: "pointer" }}>
                          <rect x={mx - boxW / 2} y={my - boxH / 2} width={boxW} height={boxH} rx="5"
                            fill="rgba(14,23,38,0.9)" stroke={col} strokeWidth="1" />
                          <text x={mx} y={my} fill={col} fontFamily={MONO} fontSize="12" fontWeight="600"
                            textAnchor="middle" dominantBaseline="central">{label}</text>
                        </g>
                      </g>
                    );
                  })}
                  {/* in-progress preview */}
                  {measurePts.length > 0 && (() => {
                    const a = measurePts[0];
                    const b = measurePts[1] || hoverPt;
                    return (
                      <g>
                        {b && (
                          <line x1={a.x * zoom} y1={a.y * zoom} x2={b.x * zoom} y2={b.y * zoom}
                            stroke={C.green} strokeWidth="2" strokeDasharray="6 4" />
                        )}
                        {measurePts.map((pt, i) => (
                          <circle key={i} cx={pt.x * zoom} cy={pt.y * zoom} r="5" fill={C.green}
                            stroke={C.void} strokeWidth="1.5" />
                        ))}
                        {b && measurePts.length < 2 && (
                          <text x={((a.x + b.x) / 2) * zoom} y={((a.y + b.y) / 2) * zoom - 10}
                            fill={C.green} fontFamily={MONO} fontSize="12" fontWeight="600"
                            textAnchor="middle">{ftIn(distFt(a, b) * 12)}</text>
                        )}
                      </g>
                    );
                  })()}
                </svg>
              )}

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
            <div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 5 }}>Layer order</div>
              {(() => {
                const layerBtn = (label, mode, disabled) => (
                  <button
                    disabled={disabled}
                    onClick={() => reorderSel(mode)}
                    style={btn({ flex: 1, padding: "6px 4px", fontSize: 11,
                      opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" })}>
                    {label}
                  </button>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {layerBtn("Bring to front", "front", atFront)}
                      {layerBtn("Send to bottom", "back", atBack)}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {layerBtn("Move up", "up", atFront)}
                      {layerBtn("Move down", "down", atBack)}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
              <button style={btn({ flex: 1 })} onClick={dupSel}>Duplicate</button>
              <button style={btn({ flex: 1, color: "#E0738C", borderColor: "#5e3340" })}
                onClick={() => { setItems((p) => p.filter((i) => i.id !== sel)); setSel(null); }}>Delete</button>
            </div>
          </div>
        )}

        {/* measurement inspector */}
        {selMeasureObj && !selItem && (
          <div style={{ width: 220, borderLeft: `1px solid ${C.line}`, background: C.panel,
            padding: 14, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            <div style={secLabel}>Measurement</div>
            <div style={{ fontFamily: MONO, fontSize: 26, color: C.green }}>
              {ftIn(distFt({ x: selMeasureObj.ax, y: selMeasureObj.ay },
                { x: selMeasureObj.bx, y: selMeasureObj.by }) * 12)}
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>Name</div>
              <input value={selMeasureObj.name} placeholder="Optional name"
                onChange={(e) => setMeasures((p) => p.map((m) =>
                  m.id === selMeasure ? { ...m, name: e.target.value } : m))}
                style={{ width: "100%", background: C.void, color: C.text, boxSizing: "border-box",
                  border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 9px", fontSize: 13 }} />
            </div>
            <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
              Drag either endpoint on the plan to adjust.
            </div>
            <button style={btn({ marginTop: "auto", color: "#E0738C", borderColor: "#5e3340" })}
              onClick={() => { setMeasures((p) => p.filter((m) => m.id !== selMeasure)); setSelMeasure(null); }}>
              Delete measurement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
