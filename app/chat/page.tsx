import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const { repo } = await searchParams;
  if (!repo) redirect("/repos");
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <a href="/repos" className="font-semibold">eve</a>
          <span className="truncate text-sm text-neutral-400">{repo}</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={session.avatar} alt="" className="h-7 w-7 rounded-full" />
      </header>
      <Chat repo={repo} />
    </div>
  );
}
