import { courseColorFor, courseUpcoming } from "@/lib/agenda";
import { canvas, canvasWebUrl } from "@/lib/canvas";
import { courseColor, courseLabel, courseScore } from "@/lib/courses";
import { demoBlocked } from "@/lib/demo";
import { getExtras, manualCourse } from "@/lib/extras";
import { guard, jsonError } from "@/lib/http";
import { getCourseMaterials, summarizeExtras } from "@/lib/materials";
import type { CourseInfo, CourseView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id === 0) return Response.json({ error: "Bad course id" }, { status: 400 });
  try {
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    let course: CourseInfo;
    if (id < 0) {
      const mc = manualCourse(id);
      if (!mc) return Response.json({ error: "That class isn't here anymore." }, { status: 404 });
      course = { id, name: mc.name, code: mc.code, color: mc.color, score: null, url: "", manual: true };
    } else {
      const c = await canvas.course(id);
      const { name, code } = courseLabel(c);
      course = { id, name, code, color: courseColorFor(id) ?? courseColor(c, 0), score: courseScore(c), url: canvasWebUrl(`/courses/${id}`) };
    }
    const [materials, upcoming] = await Promise.all([getCourseMaterials(id, force), courseUpcoming(id, force)]);
    const view: CourseView = {
      course,
      extras: summarizeExtras(getExtras(id)),
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
