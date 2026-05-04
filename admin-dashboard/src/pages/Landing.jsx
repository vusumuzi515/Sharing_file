import { Link } from 'react-router-dom';
import { INYATSI_BRAND } from '../brand';

export default function Landing() {
  const { groupName, portalLabel, tagline, valuesPrimary, valuesSecondary } = INYATSI_BRAND;

  return (
    <div className="landing-hero portal-shell-bg relative flex min-h-[100dvh] w-full flex-col text-neutral-900">
      <main className="relative z-[1] flex min-h-[100dvh] w-full flex-1 flex-col">
        <div className="flex min-h-[100dvh] w-full flex-1 flex-col items-center justify-center bg-white/[0.08] px-5 py-12 backdrop-blur-[2px] ring-1 ring-inset ring-neutral-300/25 sm:px-10 md:px-14 lg:py-16">
          <div className="w-full max-w-[32rem] sm:max-w-xl">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-600">
              Secure document access
            </p>

            <h1 className="mt-4 text-center text-[1.6rem] font-bold leading-tight tracking-tight text-neutral-950 sm:text-4xl">
              {groupName}
            </h1>

            <p className="tagline-serif mt-4 text-center text-base italic leading-snug text-neutral-700 sm:text-lg">
              {tagline}
            </p>

            <div className="mx-auto mt-6 flex max-w-[12rem] flex-col items-center gap-2">
              <span className="h-0.5 w-full rounded-full bg-neutral-950/90" aria-hidden />
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-neutral-400/60" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-600">
                  Core values
                </span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-neutral-400/60" aria-hidden />
              </div>

              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {valuesPrimary.map((value) => (
                  <li
                    key={value}
                    className="rounded-xl border border-neutral-300/80 bg-neutral-950/[0.03] px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-900 shadow-sm sm:text-[10px]"
                  >
                    {value}
                  </li>
                ))}
              </ul>

              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {valuesSecondary.map((value) => (
                  <li
                    key={value}
                    className="rounded-xl border border-neutral-200 bg-white/70 px-3.5 py-2.5 text-left text-[13px] font-medium leading-snug text-neutral-800 shadow-sm transition duration-200 hover:border-neutral-400 hover:bg-white sm:text-sm"
                  >
                    {value}
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-8 text-center text-xs font-medium text-neutral-600">{portalLabel}</p>

            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/dashboard"
                className="btn-primary inline-flex min-h-[50px] w-full max-w-xs items-center justify-center rounded-xl px-8 text-[15px] font-semibold shadow-[0_14px_32px_-12px_rgba(0,0,0,0.35)] transition hover:bg-neutral-800 active:scale-[0.99] sm:w-auto sm:min-w-[220px]"
              >
                Enter file portal
              </Link>
              <p className="max-w-[17rem] text-center text-[11px] leading-relaxed text-neutral-600">
                Sign in with your departmental credentials on the next screen.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
