import Hero from "@/components/landing/Hero";
import WhatWeDo from "@/components/landing/WhatWeDo";
import HowItWorks from "@/components/landing/HowItWorks";
import ProjectShowcase from "@/components/landing/ProjectShowcase";
import Footer from "@/components/layout/Footer";

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
