import Hero from "@/components/agentbase/Hero";
import WhatWeDo from "@/components/agentbase/WhatWeDo";
import HowItWorks from "@/components/agentbase/HowItWorks";
import ProjectShowcase from "@/components/agentbase/ProjectShowcase";
import Footer from "@/components/agentbase/Footer";

export default function Home() {
  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <Hero />
        <WhatWeDo />
        <ProjectShowcase />
        <HowItWorks />
      </main>

      <Footer />
    </>
  );
}
