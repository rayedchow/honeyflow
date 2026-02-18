# SourceFund - Recursive Funding Platform

A Next.js application that showcases a recursive funding model for open-source projects, where contributions automatically flow through the entire dependency chain.

## Features

- **Recursive Funding Model**: Donations automatically split across project authors, dependencies, and contributors
- **Interactive DAG Visualization**: Animated graph showing the flow of funds through the ecosystem
- **Modern UI**: Built with Next.js 15, React 19, TypeScript, and Tailwind CSS
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js 20.17.0 or higher
- pnpm

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Build

```bash
pnpm run build
pnpm start
```

## Project Structure

```
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles with CSS variables
├── components/
│   ├── Navbar.tsx          # Navigation bar component
│   ├── Hero.tsx            # Hero section with CTA buttons
│   ├── DAGVisualization.tsx # Animated dependency graph
│   └── Features.tsx        # Comparison section
└── public/                 # Static assets
```

## Key Components

### DAGVisualization

An interactive visualization showing:
- Center node: Main project
- Ring 1: Direct dependencies (Lib-A, Lib-B, Lib-C, Lib-D)
- Ring 2: Contributors (Dev 1-8)
- Animated flow showing how funding cascades through the network

### Features

Comparison cards showing:
1. Traditional crowdfunding (direct flow)
2. Recursive split model (our approach)
3. The result (full infrastructure funding)

## Technology Stack

- **Framework**: Next.js 15.5.12
- **UI Library**: React 19
- **Styling**: Tailwind CSS 3.4
- **Language**: TypeScript 5
- **Package Manager**: pnpm

## Design Highlights

- Dark theme with gradient accents (#1D976C → #93F9B9 → #E8A856)
- Smooth animations and transitions
- Glassmorphism effects
- Interactive hover states
- Mobile-responsive grid layouts

## License

MIT
