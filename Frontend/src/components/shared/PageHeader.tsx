import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface PageCrumb {
  label: string;
  /** Omit for the current page. */
  href?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right. Keep to one primary button per view. */
  actions?: ReactNode;
  breadcrumbs?: PageCrumb[];
  /**
   * Heading level. Pages inside DashboardLayout already have the repository
   * name as their h1, so they pass "h2".
   */
  as?: "h1" | "h2";
  className?: string;
}

/** A page's title row: optional breadcrumbs, the title and description, and actions. */
export function PageHeader({ title, description, actions, breadcrumbs, as = "h1", className }: PageHeaderProps) {
  const Heading = as;
  return (
    <div className={cn("space-y-2", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {/* Page titles are 30px bold, as on every top-level app page; an h2
              header inside a workspace (whose layout owns the h1) is 24px. */}
          <Heading
            className={cn(
              "tracking-tight text-foreground",
              as === "h1" ? "text-3xl font-bold" : "text-2xl font-semibold"
            )}
          >
            {title}
          </Heading>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export default PageHeader;
