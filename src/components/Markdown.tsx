"use client";

import Link from "next/link";
import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
  [rehypeKatex, { throwOnError: false, strict: "ignore" }],
];

const link: Components["a"] = ({ href, children }) =>
  href?.startsWith("/") ? (
    <Link href={href}>{children}</Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );

const blockComponents: Components = { a: link };
const inlineComponents: Components = { a: link, p: ({ children }) => <span>{children}</span> };

const PROSE =
  "prose prose-stone max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-headings:tracking-tight prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-pre:bg-stone-900 prose-pre:text-stone-100 prose-table:text-sm prose-li:my-0.5";

export function Markdown({ children, inline = false, className = "" }: { children: string; inline?: boolean; className?: string }) {
  const md = (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={inline ? inlineComponents : blockComponents}
    >
      {children}
    </ReactMarkdown>
  );
  return inline ? <span className={className}>{md}</span> : <div className={`${PROSE} ${className}`}>{md}</div>;
}

/** Split a guide at its "## Answer Key" heading so solutions stay hidden until asked for. */
export function splitAnswerKey(markdown: string): [string, string | null] {
  const m = markdown.match(/^#{1,3}\s*Answer Key\s*$/im);
  if (!m || m.index === undefined) return [markdown, null];
  return [markdown.slice(0, m.index), markdown.slice(m.index + m[0].length)];
}

export function GuideBody({ markdown, streaming = false }: { markdown: string; streaming?: boolean }) {
  const [body, answers] = splitAnswerKey(markdown);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Markdown>{body}</Markdown>
      {answers !== null && (
        <section className="mt-10 rounded-xl border border-dashed border-stone-300 p-5 dark:border-stone-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Answer key</h2>
            {!streaming && (
              <button className="btn btn-sm print:hidden" onClick={() => setOpen(!open)}>
                {open ? "Hide answers" : "Show answers"}
              </button>
            )}
          </div>
          {streaming ? (
            <p className="mt-2 text-sm muted">Writing the answer key… It stays hidden so you can try the problems first.</p>
          ) : open ? (
            <Markdown className="mt-4">{answers}</Markdown>
          ) : (
            <p className="mt-2 text-sm muted">Try the problems first, then check your work.</p>
          )}
        </section>
      )}
    </>
  );
}
