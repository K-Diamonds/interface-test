import { Link } from "react-router-dom";
import { Breadcrumbs } from "./Breadcrumbs";

export function Header({
  crumbs,
  healthOk,
  hosted,
}: {
  crumbs: Array<{ label: string; to?: string }>;
  healthOk?: boolean;
  hosted?: boolean;
}) {
  return (
    <header className="h-11 flex-shrink-0 bg-white border-b border-slate-200 flex items-center px-4 gap-3">
      <div className="flex-1 min-w-0">
        <Breadcrumbs crumbs={crumbs} />
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded font-mono">
          {hosted ? "Catalog" : "Development"}
        </span>
        {healthOk === false ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>API unreachable</span>
          </div>
        ) : null}
        <Link to="/system" className="text-xs text-slate-400 hover:text-slate-700">
          System
        </Link>
      </div>
    </header>
  );
}
