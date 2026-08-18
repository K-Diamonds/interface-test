import { Link } from "react-router-dom";

export function MonoLink({
  to,
  children,
}: {
  to: string;
  children: string;
}) {
  return (
    <Link to={to} className="font-mono text-sm text-blue-600 hover:underline">
      {children}
    </Link>
  );
}
