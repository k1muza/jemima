export type NavItem = {
  title: string;
  href: string;
  /** Show the product count beside the label. */
  showCount?: boolean;
};

/** Sidebar navigation. Add a route here when you add a dashboard page. */
export const dashboardNav: NavItem[] = [
  { title: "Overview", href: "/dashboard" },
  { title: "Products", href: "/dashboard/products", showCount: true },
  { title: "Inventory", href: "/dashboard/inventory" },
  { title: "Insights", href: "/dashboard/insights" },
  { title: "Settings", href: "/dashboard/settings" },
];
