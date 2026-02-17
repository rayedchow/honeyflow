import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Background from "@/components/Background";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="relative z-10 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 pb-16">
          <Hero />
          <Features />
        </main>
      </div>
    </div>
  );
}
