import Hero from "@/components/agentbase/Hero";
import ApiFeatures from "@/components/agentbase/ApiFeatures";
import ProjectShowcase from "@/components/agentbase/ProjectShowcase";
import Testimonials from "@/components/agentbase/Testimonials";
import Footer from "@/components/agentbase/Footer";

export default function Home() {
  return (
    <>
      <main className="flex-col flex w-full flex-1">
        <Hero />
        <Testimonials />
        <ProjectShowcase />
        <ApiFeatures />
      </main>

      <Footer />
    </>
  );
}
