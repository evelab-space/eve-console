import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ProjectView } from "./project-view";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const { slug } = await params;
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <a href="/repos" className="font-semibold">eve</a>
          <nav className="flex gap-4 text-sm text-neutral-400">
            <a href="/repos" className="hover:text-white">Repositories</a>
          </nav>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={session.avatar} alt="" className="h-7 w-7 rounded-full" />
      </header>
      <ProjectView slug={slug} />
    </div>
  );
}
