import type { ReactNode, Ref } from "react";

export function CollectionBanner({ name, image, children, ref }: {
  name: string;
  image?: string | null;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      data-testid="collection-header-image"
      className="relative -mx-4 overflow-hidden border-y border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)] sm:-mx-6"
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`${name} banner`}
            src={image}
            className="hero-image absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--realm-bg-void)] via-[color:var(--realm-bg-void)]/70 to-transparent" />
        </>
      ) : null}
      <div className="hero-content relative flex min-h-32 flex-wrap items-end justify-between gap-3 px-4 py-4 sm:min-h-40 sm:px-6">
        <h1 className="realm-title min-w-0 break-words text-2xl text-[color:var(--realm-title)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] sm:text-3xl">
          {name}
        </h1>
        {children}
      </div>
    </div>
  );
}
