import type { Session } from "@/lib/session";

// Top bar on desktop, bottom tab bar on phones (thumb reach).
export function Nav({ session, active }: { session: Session; active: "projects" | "repos" }) {
  const link = (key: string, href: string, label: string) => (
    <a
      href={href}
      className={`flex-1 py-3 text-center text-sm sm:flex-none sm:py-0 ${active === key ? "text-white" : "text-neutral-400 hover:text-white"}`}
    >
      {label}
    </a>
  );
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-black/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-6">
          <a href="/projects" className="font-semibold">eve</a>
          <nav className="hidden gap-5 sm:flex">
            {link("projects", "/projects", "Projects")}
            {link("repos", "/repos", "Import")}
          </nav>
        </div>
        <form action="/api/auth/logout" method="post" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={session.avatar} alt="" className="h-8 w-8 rounded-full" />
          <span className="hidden text-sm text-neutral-300 sm:inline">{session.login}</span>
          <button className="hidden text-sm text-neutral-500 hover:text-white sm:inline">Sign out</button>
        </form>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-800 bg-black/90 backdrop-blur sm:hidden">
        {link("projects", "/projects", "Projects")}
        {link("repos", "/repos", "Import")}
      </nav>
    </>
  );
}
