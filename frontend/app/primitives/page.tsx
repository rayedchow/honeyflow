export default function Primitives() {
  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <section className="w-full border-b border-agentbase-border">
          <div className="flex flex-col space-y-5 px-8 py-12">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] font-sans text-agentbase-text">
              The Internet runs on unpaid labor.
            </h1>

            <p className="text-base text-agentbase-muted font-medium leading-relaxed">
              Every framework, every library, every protocol you depend on was built by people who were never compensated for it. Not because the money doesn&apos;t exist; billions flow into open source every year. But it pools at the top. One maintainer gets a grant. The thousands of contributors underneath them get a thank you in the changelog.
            </p>

            <h3 className="text-lg font-bold text-black tracking-tight">
              We&apos;ve been funding projects. We should have been funding people.
            </h3>

            <p className="text-base text-agentbase-muted font-medium leading-relaxed">
              HoneyFlow exists because attribution is a solvable problem. Every commit is signed. Every dependency is traceable. Every paper is cited. The graph of who built what already exists. It&apos;s just never been connected to money.
            </p>

            <h3 className="text-lg font-bold text-black tracking-tight">
              So we connected it.
            </h3>

            <p className="text-base text-agentbase-muted font-medium leading-relaxed">
              We built a protocol that takes funding and pushes it through the full contribution graph recursively, proportionally, verifiably. Not decided by a committee. Not gated by an application. Verified by a decentralized jury of humans with economic skin in the game, and distributed automatically on-chain.
            </p>

            <p className="text-base text-agentbase-muted font-medium leading-relaxed">
              Open source gave us everything. It&apos;s time the money followed the work.
            </p>

            <p className="text-lg font-bold text-black italic font-serif">
              Suum cuique. To each what they deserve.
            </p>
          </div>
        </section>
      </main>

      <footer className="w-full bg-agentbase-surface flex flex-col items-center justify-center">
        <h2 className="text-[clamp(4rem,15vw,10rem)] font-bold tracking-tighter leading-none text-agentbase-yellow text-center">
          HONEYFLOW
        </h2>
        <p className="text-xs text-black/40 font-sans pb-4 pt-2">© 2026 HoneyFlow.</p>
      </footer>
    </>
  );
}
