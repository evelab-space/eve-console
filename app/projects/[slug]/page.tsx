import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Nav } from "../../nav";
import { ProjectView } from "./project-view";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const { slug } = await params;
  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Nav session={session} active="projects" />
      <ProjectView slug={slug} />
    </div>
  );
}
