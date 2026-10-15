import { PageHeader as SharedPageHeader } from "@/components/shared/PageHeader";
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface Crumb {
  label: string;
  /** Omitted for the current page, which is the last crumb. */
  to?: string;
}

/**
 * "Organizations / Acme / Platform" - the way back up, as plain links.
 * Replaces the icon-only back arrows these pages used to carry.
 */
export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1.5 sm:gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <BreadcrumbItem className="min-w-0">
                {last || !item.to ? (
                  <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      to={item.to}
                      className="truncate rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Shared header for the organization, team and executive pages so the three
 * read as one area: same breadcrumb line, title size and description style.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
}: {
  breadcrumb: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  // One implementation: this keeps the organisation pages' prop names and
  // delegates to the app-wide header.
  return (
    <SharedPageHeader
      className="mb-8"
      title={title}
      description={description}
      actions={actions}
      breadcrumbs={breadcrumb.map((crumb) => ({ label: crumb.label, href: crumb.to }))}
    />
  );
}
