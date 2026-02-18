"use client";

import { useEffect, useRef } from "react";

interface NodePosition {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: string;
}

interface Connection {
  from: string;
  to: string;
  id: string;
}

interface Flow {
  path: string;
  nodes: string[];
  delay: number;
}

export default function DAGVisualization() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const nodes: NodePosition[] = [
    { id: "node-center", x: 50, y: 50, label: "Paper", icon: "file" },
    { id: "node-dep-n", x: 50, y: 22, label: "Lib-A", icon: "package" },
    { id: "node-dep-e", x: 78, y: 50, label: "Lib-B", icon: "star" },
    { id: "node-dep-s", x: 50, y: 78, label: "Lib-C", icon: "circle" },
    { id: "node-dep-w", x: 22, y: 50, label: "Lib-D", icon: "box" },
    { id: "node-auth-n1", x: 42, y: 8, label: "Dev 1", icon: "user" },
    { id: "node-auth-n2", x: 58, y: 8, label: "Dev 2", icon: "user" },
    { id: "node-auth-e1", x: 90, y: 42, label: "Dev 3", icon: "user" },
    { id: "node-auth-e2", x: 90, y: 58, label: "Dev 4", icon: "user" },
    { id: "node-auth-s1", x: 42, y: 92, label: "Dev 5", icon: "user" },
    { id: "node-auth-s2", x: 58, y: 92, label: "Dev 6", icon: "user" },
    { id: "node-auth-w1", x: 10, y: 42, label: "Dev 7", icon: "user" },
    { id: "node-auth-w2", x: 10, y: 58, label: "Dev 8", icon: "user" },
  ];

  const connections: Connection[] = [
    { from: "node-center", to: "node-dep-n", id: "p-dep-n" },
    { from: "node-center", to: "node-dep-e", id: "p-dep-e" },
    { from: "node-center", to: "node-dep-s", id: "p-dep-s" },
    { from: "node-center", to: "node-dep-w", id: "p-dep-w" },
    { from: "node-dep-n", to: "node-auth-n1", id: "p-auth-n1" },
    { from: "node-dep-n", to: "node-auth-n2", id: "p-auth-n2" },
    { from: "node-dep-e", to: "node-auth-e1", id: "p-auth-e1" },
    { from: "node-dep-e", to: "node-auth-e2", id: "p-auth-e2" },
    { from: "node-dep-s", to: "node-auth-s1", id: "p-auth-s1" },
    { from: "node-dep-s", to: "node-auth-s2", id: "p-auth-s2" },
    { from: "node-dep-w", to: "node-auth-w1", id: "p-auth-w1" },
    { from: "node-dep-w", to: "node-auth-w2", id: "p-auth-w2" },
  ];

  const flows: Flow[] = [
    { path: "p-dep-n", nodes: ["node-center", "node-dep-n"], delay: 0 },
    { path: "p-dep-e", nodes: ["node-center", "node-dep-e"], delay: 150 },
    { path: "p-dep-s", nodes: ["node-center", "node-dep-s"], delay: 300 },
    { path: "p-dep-w", nodes: ["node-center", "node-dep-w"], delay: 450 },
    { path: "p-auth-n1", nodes: ["node-dep-n", "node-auth-n1"], delay: 1200 },
    { path: "p-auth-n2", nodes: ["node-dep-n", "node-auth-n2"], delay: 1300 },
    { path: "p-auth-e1", nodes: ["node-dep-e", "node-auth-e1"], delay: 1400 },
    { path: "p-auth-e2", nodes: ["node-dep-e", "node-auth-e2"], delay: 1500 },
    { path: "p-auth-s1", nodes: ["node-dep-s", "node-auth-s1"], delay: 1600 },
    { path: "p-auth-s2", nodes: ["node-dep-s", "node-auth-s2"], delay: 1700 },
    { path: "p-auth-w1", nodes: ["node-dep-w", "node-auth-w1"], delay: 1800 },
    { path: "p-auth-w2", nodes: ["node-dep-w", "node-auth-w2"], delay: 1900 },
  ];

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case "file":
        return (
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6" />
        );
      case "package":
        return <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />;
      case "star":
        return (
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        );
      case "circle":
        return <circle cx="12" cy="12" r="10" />;
      case "box":
        return (
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8" />
        );
      case "user":
        return (
          <>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </>
        );
      default:
        return <circle cx="12" cy="12" r="10" />;
    }
  };

  useEffect(() => {
    let active = true;

    const updateLines = () => {
      if (!containerRef.current || !svgRef.current) return;

      const cRect = containerRef.current.getBoundingClientRect();

      const getCenter = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - cRect.left,
          y: rect.top + rect.height / 2 - cRect.top,
        };
      };

      connections.forEach((conn) => {
        const p1 = getCenter(conn.from);
        const p2 = getCenter(conn.to);
        const pathStr = `M${p1.x},${p1.y} L${p2.x},${p2.y}`;

        const pathEl = document.getElementById(conn.id);
        const flowEl = document.getElementById(conn.id + "-flow");

        if (pathEl) pathEl.setAttribute("d", pathStr);
        if (flowEl) flowEl.setAttribute("d", pathStr);
      });
    };

    const runAnimation = () => {
      if (!active) return;

      document.querySelectorAll(".dag-node").forEach((n) => {
        n.classList.remove("active");
      });
      document.querySelectorAll(".connection-flow").forEach((p) => {
        const el = p as unknown as SVGPathElement;
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.strokeDashoffset = "100";
      });

      setTimeout(() => {
        if (!active) return;

        const centerNode = document.getElementById("node-center");
        if (centerNode) centerNode.classList.add("active");

        flows.forEach((item) => {
          setTimeout(() => {
            if (!active) return;

            const path = document.getElementById(item.path + "-flow");
            if (path) {
              const svgPath = path as unknown as SVGPathElement;
              svgPath.style.transition =
                "stroke-dashoffset 0.6s ease-out, opacity 0.3s ease";
              svgPath.style.opacity = "1";
              svgPath.style.strokeDashoffset = "0";
            }

            setTimeout(() => {
              if (!active) return;
              const destNodeId = item.nodes[1];
              if (destNodeId) {
                const node = document.getElementById(destNodeId);
                if (node) node.classList.add("active");
              }
            }, 500);
          }, item.delay);
        });

        setTimeout(runAnimation, 4500);
      }, 300);
    };

    updateLines();
    setTimeout(runAnimation, 100);

    window.addEventListener("resize", updateLines);

    return () => {
      active = false;
      window.removeEventListener("resize", updateLines);
    };
  }, []);

  return (
    <div className="relative h-[460px] w-full rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
      <div
        ref={containerRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%]"
      >
        {nodes.map((node) => {
          const isCenter = node.id === "node-center";
          const isRing2 = node.id.startsWith("node-auth");

          return (
            <div
              key={node.id}
              id={node.id}
              className={`dag-node absolute -translate-x-1/2 -translate-y-1/2 ${
                isCenter ? "w-14 h-14" : isRing2 ? "w-10 h-10" : "w-12 h-12"
              } bg-white/[0.06] border border-white/[0.1] rounded-xl flex justify-center items-center z-10 transition-all duration-300`}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
              }}
            >
              <span className="value-tag absolute -top-7 bg-white/[0.1] px-2 py-0.5 rounded text-[9px] font-mono font-medium text-white/65 opacity-0 -translate-y-1 transition-all duration-300 whitespace-nowrap">
                {node.label}
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`${
                  isCenter ? "w-5 h-5" : isRing2 ? "w-3.5 h-3.5" : "w-4 h-4"
                } stroke-white/25`}
              >
                {getIcon(node.icon)}
              </svg>
            </div>
          );
        })}

        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        >
          <defs>
            <filter id="softGlow">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {connections.map((conn) => (
            <g key={conn.id}>
              <path
                id={conn.id}
                className="connection-path"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
                fill="none"
              />
              <path
                id={conn.id + "-flow"}
                className="connection-flow"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="1.5"
                fill="none"
                filter="url(#softGlow)"
                strokeDasharray="100"
                strokeDashoffset="100"
                style={{ opacity: 0 }}
              />
            </g>
          ))}
        </svg>
      </div>

      <style jsx>{`
        .dag-node.active {
          border-color: rgba(255, 255, 255, 0.25);
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.08),
            0 0 32px rgba(255, 255, 255, 0.03);
          background: rgba(255, 255, 255, 0.1);
        }
        .dag-node.active svg {
          stroke: rgba(255, 255, 255, 0.75);
        }
        .dag-node.active .value-tag {
          opacity: 1;
          transform: translateY(0);
          color: rgba(255, 255, 255, 0.75);
        }
        #node-center.active {
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 0 20px rgba(255, 255, 255, 0.12),
            0 0 40px rgba(255, 255, 255, 0.04);
          background: rgba(255, 255, 255, 0.12);
        }
        #node-center.active svg {
          stroke: rgba(255, 255, 255, 0.9);
        }
        #node-center.active .value-tag {
          color: rgba(255, 255, 255, 0.9);
        }
      `}</style>
    </div>
  );
}
