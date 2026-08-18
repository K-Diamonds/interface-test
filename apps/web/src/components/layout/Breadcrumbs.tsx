import { Link } from "react-router-dom";

export function Breadcrumbs({
  crumbs,
}: {
  crumbs: Array<{ label: string; to?: string }>;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      {crumbs.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300 text-xs">/</span>}
          {crumb.to ? (
            <Link to={crumb.to} className="text-xs text-slate-400 hover:text-slate-700">
              {crumb.label}
            </Link>
          ) : (
            <span
              className={`text-xs ${
                i === crumbs.length - 1
                  ? "text-slate-700 font-medium"
                  : "text-slate-400"
              }`}
            >
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
