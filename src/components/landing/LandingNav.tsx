import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Menu, ArrowRight, Boxes } from "lucide-react";

const NAV_LINKS = [
  { href: "#product-in-action", label: "Product" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#day-in-the-life", label: "How it works" },
  { href: "#why-different", label: "Why it's different" },
];

export function LandingNav() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-background/95 backdrop-blur border-b border-border" : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2 font-bold text-foreground shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="h-4 w-4" />
          </span>
          <span className="text-lg tracking-tight">
            Medika<span className="text-primary">RP</span>
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-foreground transition-colors">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
            Sign in
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => navigate("/auth")}>
            Open workspace <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] sm:w-[340px]">
            <div className="flex flex-col gap-1 mt-10">
              {NAV_LINKS.map((link) => (
                <SheetClose asChild key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    {link.label}
                  </a>
                </SheetClose>
              ))}
              <div className="h-px bg-border my-3" />
              <SheetClose asChild>
                <Button variant="outline" className="justify-center" onClick={() => navigate("/auth")}>
                  Sign in
                </Button>
              </SheetClose>
              <SheetClose asChild>
                <Button className="justify-center gap-1.5" onClick={() => navigate("/auth")}>
                  Open workspace <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
