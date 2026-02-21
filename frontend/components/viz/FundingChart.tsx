"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Project } from "@/lib/projects";

// ── Types ────────────────────────────────────────────────────────────────────

type NodeType = "REPO" | "PAPER" | "PACKAGE" | "BODY_OF_WORK" | "CONTRIBUTOR";

interface GNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
}

interface GEdge {
  source: string;
  target: string;
  weight: number;
  label: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_TO_ROOT: Record<string, NodeType> = {
  repo: "REPO",
  paper: "PAPER",
  package: "PACKAGE",
};

const RADIUS: Record<NodeType, number> = {
  REPO: 24,
  PAPER: 24,
  PACKAGE: 24,
  BODY_OF_WORK: 13,
  CONTRIBUTOR: 9,
};

// ── Build demo graph from project data ───────────────────────────────────────

function buildDemoGraph(project: Project): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const zero = { x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0 };

  const rootType = TYPE_TO_ROOT[project.type] ?? "REPO";
  nodes.push({ id: "root", type: rootType, label: project.name, ...zero });

  const depCount = project.dependencies.length;
  const directWeight = depCount > 0 ? 0.6 : 1.0;
  const depsWeight = depCount > 0 ? 0.4 : 0;

  const totalPct = project.topContributors.reduce(
    (s, c) => s + parseFloat(c.percentage),
    0
  );
  project.topContributors.forEach((c) => {
    const id = `contrib:${c.name}`;
    nodes.push({ id, type: "CONTRIBUTOR", label: c.name, ...zero });
    const w = (parseFloat(c.percentage) / totalPct) * directWeight;
    edges.push({
      source: "root",
      target: id,
      weight: w,
      label: c.percentage,
    });
  });

  // Dependencies
  if (depCount > 0) {
    const perDep = depsWeight / depCount;
    project.dependencies.forEach((dep, i) => {
      const depId = `dep:${dep}`;
      nodes.push({ id: depId, type: "BODY_OF_WORK", label: dep, ...zero });
      edges.push({
        source: "root",
        target: depId,
        weight: perDep,
        label: `${Math.round(perDep * 100)}%`,
      });

      // Give each dep 1-2 pseudo contributors
      const seed = project.raisedNumeric + i * 37;
      const names = [`dev${i + 1}.eth`, `builder${i + 1}.eth`];
      const count = 1 + (seed % 2);
      for (let j = 0; j < count; j++) {
        const cId = `dep-contrib:${dep}:${names[j]}`;
        nodes.push({ id: cId, type: "CONTRIBUTOR", label: names[j], ...zero });
        edges.push({
          source: depId,
          target: cId,
          weight: 1 / count,
          label: `${Math.round((1 / count) * 100)}%`,
        });
      }
    });
  }

  return { nodes, edges };
}

// ── Radial initial layout ────────────────────────────────────────────────────

function radialLayout(nodes: GNode[], edges: GEdge[]) {
  const nodeMap: Record<string, GNode> = {};
  const childrenOf: Record<string, string[]> = {};
  nodes.forEach((n) => (nodeMap[n.id] = n));
  edges.forEach((e) => {
    if (!childrenOf[e.source]) childrenOf[e.source] = [];
    childrenOf[e.source].push(e.target);
  });

  const root = nodes[0];
  if (!root) return;
  root.x = 0;
  root.y = 0;

  const placed = new Set([root.id]);
  const queue = [root.id];
  let ring = 0;

  while (queue.length > 0) {
    ring++;
    const ringDist = ring * 160;
    const batch = [...queue];
    queue.length = 0;

    const allChildren: { pid: string; cid: string }[] = [];
    batch.forEach((pid) => {
      (childrenOf[pid] || []).forEach((cid) => {
        if (!placed.has(cid)) allChildren.push({ pid, cid });
      });
    });

    if (allChildren.length === 0) continue;

    allChildren.forEach(({ pid, cid }, i) => {
      const parent = nodeMap[pid];
      const n = nodeMap[cid];
      if (!n || !parent) return;
      const angle = (2 * Math.PI * i) / allChildren.length - Math.PI / 2;
      const jitter = Math.sin(i * 7.1) * 20;
      n.x = parent.x + Math.cos(angle) * (ringDist + jitter);
      n.y = parent.y + Math.sin(angle) * (ringDist + jitter);
      placed.add(cid);
      queue.push(cid);
    });
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ContributionGraphCanvas({
  project,
}: {
  project: Project;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    nodes: GNode[];
    edges: GEdge[];
    nodeMap: Record<string, GNode>;
    alpha: number;
    running: boolean;
    camX: number;
    camY: number;
    camZ: number;
    drag: GNode | null;
    hover: GNode | null;
    panStart: { x: number; y: number; cx: number; cy: number } | null;
    W: number;
    H: number;
    dpr: number;
    animId: number;
    isDark: boolean;
  } | null>(null);

  const getColors = useCallback((isDark: boolean) => {
    return {
      REPO: isDark ? "#FEC508" : "#D4A507",
      PAPER: isDark ? "#FEC508" : "#D4A507",
      PACKAGE: isDark ? "#FEC508" : "#D4A507",
      BODY_OF_WORK: isDark ? "#2ecc71" : "#1a9c54",
      CONTRIBUTOR: isDark ? "#e8913a" : "#c67520",
      edgeBase: isDark ? "rgba(255,255,255," : "rgba(0,0,0,",
      labelColor: isDark ? "#ccc" : "#555",
      labelHover: isDark ? "#fff" : "#000",
      bg: isDark ? "#1A1A1A" : "#F5F5F5",
      edgeLabelColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)",
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { nodes, edges } = buildDemoGraph(project);
    const nodeMap: Record<string, GNode> = {};
    nodes.forEach((n) => (nodeMap[n.id] = n));

    radialLayout(nodes, edges);

    const isDark = document.documentElement.classList.contains("dark");

    const state = {
      nodes,
      edges,
      nodeMap,
      alpha: 1,
      running: true,
      camX: 0,
      camY: 0,
      camZ: 1,
      drag: null as GNode | null,
      hover: null as GNode | null,
      panStart: null as { x: number; y: number; cx: number; cy: number } | null,
      W: 0,
      H: 0,
      dpr: 1,
      animId: 0,
      isDark,
    };
    stateRef.current = state;

    // ── Resize ──

    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect();
      state.dpr = window.devicePixelRatio || 1;
      state.W = rect.width;
      state.H = rect.height;
      canvas!.width = state.W * state.dpr;
      canvas!.height = state.H * state.dpr;
      canvas!.style.width = state.W + "px";
      canvas!.style.height = state.H + "px";
      ctx!.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

      state.camZ = Math.min(
        1,
        Math.min(state.W, state.H) / (nodes.length * 22 + 400)
      );
    }

    resize();
    window.addEventListener("resize", resize);

    // ── Force tick ──

    function tick() {
      if (!state.running) return;
      if (state.alpha < 0.002) {
        state.running = false;
        return;
      }
      state.alpha *= 0.995;
      const alpha = state.alpha;
      const N = state.nodes.length;

      // Repulsion
      for (let i = 0; i < N; i++) {
        const a = state.nodes[i];
        for (let j = i + 1; j < N; j++) {
          const b = state.nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 4) {
            dx = Math.sin(i) * 0.5;
            dy = Math.cos(j) * 0.5;
            d2 = 1;
          }
          const d = Math.sqrt(d2);
          const f = (-2000 * alpha) / d2;
          const ux = dx / d;
          const uy = dy / d;
          a.fx -= ux * f;
          a.fy -= uy * f;
          b.fx += ux * f;
          b.fy += uy * f;

          const minDist =
            (RADIUS[a.type] || 12) + (RADIUS[b.type] || 12) + 8;
          if (d < minDist) {
            const push = (minDist - d) * 0.5;
            a.fx -= ux * push;
            a.fy -= uy * push;
            b.fx += ux * push;
            b.fy += uy * push;
          }
        }
      }

      // Springs
      state.edges.forEach((e) => {
        const s = state.nodeMap[e.source];
        const t = state.nodeMap[e.target];
        if (!s || !t) return;
        let targetDist = 160;
        if (t.type === "CONTRIBUTOR") targetDist = 100;
        if (
          s.type === "REPO" ||
          s.type === "PAPER" ||
          s.type === "PACKAGE"
        )
          targetDist = 220;

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - targetDist) * 0.06 * alpha;
        const ux = dx / d;
        const uy = dy / d;
        s.fx += ux * f;
        s.fy += uy * f;
        t.fx -= ux * f;
        t.fy -= uy * f;
      });

      // Center root
      const root = state.nodes[0];
      if (root) {
        root.fx -= root.x * 0.05 * alpha;
        root.fy -= root.y * 0.05 * alpha;
      }

      // Integrate
      state.nodes.forEach((n) => {
        if (n === state.drag) {
          n.fx = 0;
          n.fy = 0;
          return;
        }
        n.vx = (n.vx + n.fx) * 0.55;
        n.vy = (n.vy + n.fy) * 0.55;
        n.x += n.vx;
        n.y += n.vy;
        n.fx = 0;
        n.fy = 0;
      });
    }

    // ── Draw ──

    function screenX(x: number) {
      return (x - state.camX) * state.camZ + state.W / 2;
    }
    function screenY(y: number) {
      return (y - state.camY) * state.camZ + state.H / 2;
    }
    function worldX(sx: number) {
      return (sx - state.W / 2) / state.camZ + state.camX;
    }
    function worldY(sy: number) {
      return (sy - state.H / 2) / state.camZ + state.camY;
    }

    function draw() {
      const c = getColors(state.isDark);
      ctx!.clearRect(0, 0, state.W, state.H);

      // Edges
      state.edges.forEach((e) => {
        const s = state.nodeMap[e.source];
        const t = state.nodeMap[e.target];
        if (!s || !t) return;
        const sx = screenX(s.x);
        const sy = screenY(s.y);
        const tx = screenX(t.x);
        const ty = screenY(t.y);

        ctx!.beginPath();
        ctx!.moveTo(sx, sy);
        ctx!.lineTo(tx, ty);
        ctx!.lineWidth = Math.max(0.4, e.weight * 5) * state.camZ;
        ctx!.strokeStyle =
          c.edgeBase + (0.05 + e.weight * 0.2) + ")";
        ctx!.stroke();

        if (state.camZ > 0.45 && e.weight > 0.02) {
          const mx = sx * 0.55 + tx * 0.45;
          const my = sy * 0.55 + ty * 0.45;
          ctx!.fillStyle = c.edgeLabelColor;
          ctx!.font =
            Math.max(8, 9 * state.camZ) + "px var(--font-geist-mono), monospace";
          ctx!.textAlign = "center";
          ctx!.fillText(e.label, mx, my - 3 * state.camZ);
        }
      });

      // Nodes: draw contributors first, then BOW, then root on top
      const order: NodeType[] = [
        "CONTRIBUTOR",
        "BODY_OF_WORK",
        "REPO",
        "PAPER",
        "PACKAGE",
      ];
      const sorted = [...state.nodes].sort(
        (a, b) => order.indexOf(a.type) - order.indexOf(b.type)
      );

      sorted.forEach((n) => {
        const x = screenX(n.x);
        const y = screenY(n.y);
        const r = RADIUS[n.type] * state.camZ;
        const col =
          c[n.type as keyof typeof c] ?? c.BODY_OF_WORK;
        const isHover = state.hover === n;

        // Glow
        if (r > 3) {
          const grd = ctx!.createRadialGradient(
            x,
            y,
            r * 0.3,
            x,
            y,
            r * 3
          );
          grd.addColorStop(
            0,
            (col as string) + (isHover ? "50" : "25")
          );
          grd.addColorStop(1, (col as string) + "00");
          ctx!.beginPath();
          ctx!.arc(x, y, r * 3, 0, Math.PI * 2);
          ctx!.fillStyle = grd;
          ctx!.fill();
        }

        // Circle
        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.fillStyle = isHover
          ? (col as string)
          : (col as string) + "bb";
        ctx!.fill();
        if (isHover) {
          ctx!.lineWidth = 2;
          ctx!.strokeStyle = c.labelHover;
          ctx!.stroke();
        }

        // Label
        const isRoot =
          n.type === "REPO" || n.type === "PAPER" || n.type === "PACKAGE";
        const isMid = n.type === "BODY_OF_WORK";
        const minZoom = isRoot ? 0 : isMid ? 0.35 : 0.55;
        if (state.camZ > minZoom) {
          ctx!.fillStyle = isHover ? c.labelHover : c.labelColor;
          const fs = isRoot ? 12 : isMid ? 10 : 8.5;
          ctx!.font =
            Math.max(7, fs * Math.min(state.camZ, 1.6)) +
            "px var(--font-geist-mono), monospace";
          ctx!.textAlign = "center";
          let label = n.label;
          if (label.length > 20) label = label.slice(0, 19) + "\u2026";
          ctx!.fillText(label, x, y + r + 11 * Math.min(state.camZ, 1.2));
        }
      });
    }

    // ── Loop ──

    function loop() {
      const steps = state.alpha > 0.3 ? 4 : 2;
      for (let i = 0; i < steps; i++) tick();
      draw();
      state.animId = requestAnimationFrame(loop);
    }

    state.animId = requestAnimationFrame(loop);

    // ── Interaction ──

    function nodeAt(mx: number, my: number): GNode | null {
      const wx = worldX(mx);
      const wy = worldY(my);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const r = RADIUS[n.type] + 6;
        if ((n.x - wx) ** 2 + (n.y - wy) ** 2 < r * r) return n;
      }
      return null;
    }

    function getCanvasCoords(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onMouseDown(e: MouseEvent) {
      const { x, y } = getCanvasCoords(e);
      const n = nodeAt(x, y);
      if (n) {
        state.drag = n;
        state.running = true;
        state.alpha = Math.max(state.alpha, 0.3);
      } else {
        state.panStart = { x: e.clientX, y: e.clientY, cx: state.camX, cy: state.camY };
      }
    }

    function onMouseMove(e: MouseEvent) {
      const { x, y } = getCanvasCoords(e);
      if (state.drag) {
        state.drag.x = worldX(x);
        state.drag.y = worldY(y);
        state.drag.vx = 0;
        state.drag.vy = 0;
        state.running = true;
        state.alpha = Math.max(state.alpha, 0.08);
      } else if (state.panStart) {
        state.camX =
          state.panStart.cx - (e.clientX - state.panStart.x) / state.camZ;
        state.camY =
          state.panStart.cy - (e.clientY - state.panStart.y) / state.camZ;
      } else {
        const n = nodeAt(x, y);
        state.hover = n;
        canvas!.style.cursor = n ? "grab" : "default";
      }
    }

    function onMouseUp() {
      state.drag = null;
      state.panStart = null;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { x, y } = getCanvasCoords(e);
      const factor = e.deltaY > 0 ? 0.88 : 1.12;
      const newZ = Math.max(0.08, Math.min(5, state.camZ * factor));
      const wx = worldX(x);
      const wy = worldY(y);
      state.camZ = newZ;
      state.camX = wx - (x - state.W / 2) / state.camZ;
      state.camY = wy - (y - state.H / 2) / state.camZ;
    }

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Watch for dark mode changes
    const observer = new MutationObserver(() => {
      state.isDark = document.documentElement.classList.contains("dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      cancelAnimationFrame(state.animId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, [project, getColors]);

  return (
    <div>
      <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-agentbase-muted mb-3">
        Contribution Graph
      </p>
      <div className="relative w-full aspect-[16/9] bg-agentbase-canvasBg border border-agentbase-border overflow-hidden">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
      <div className="flex items-center gap-4 mt-3">
        {[
          { color: "bg-agentbase-yellow", label: "Source" },
          { color: "bg-green-500", label: "Dependency" },
          { color: "bg-orange-500", label: "Contributor" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            <span className="text-[9px] font-mono text-agentbase-muted uppercase tracking-widest">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
