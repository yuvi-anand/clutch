import { courseColorFor, courseUpcoming } from "@/lib/agenda";
import { demoBlocked } from "@/lib/demo";
import { canvas, canvasWebUrl } from "@/lib/canvas";
import { courseColor, courseLabel, courseScore } from "@/lib/courses";
import { guard, jsonError } from "@/lib/http";
import { getCourseMaterials } from "@/lib/materials";
import type { CourseView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Bad course id" }, { status: 400 });
  try {
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const [course, materials, upcoming] = await Promise.all([
      canvas.course(id),
      getCourseMaterials(id, force),
      courseUpcoming(id, force),
    ]);
    const { name, code } = courseLabel(course);
    const view: CourseView = {
      course: {
        id,
        name,
        code,
        color: courseColorFor(id) ?? courseColor(course, 0),
        score: courseScore(course),
        url: canvasWebUrl(`/courses/${id}`),
      },
      modules: materials.modules,
      otherFiles: materials.otherFiles,
      otherPages: materials.otherPages,
      upcoming,
    };
    return Response.json(view);
  } catch (e) {
    return jsonError(e);
  }
}
