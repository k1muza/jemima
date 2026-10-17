export type NavItem = {
  title: string;
  href: string;
  /** Show this count beside the label. */
  count?: "products" | "catalogues";
};

/** Sidebar navigation. Add a route here when you add a dashboard page. */
export const dashboardNav: NavItem[] = [
  { title: "Overview", href: "/dashboard" },
  { title: "Products", href: "/dashboard/products", count: "products" },
  { title: "Inventory", href: "/dashboard/inventory" },
  { title: "Insights", href: "/dashboard/insights" },
  { title: "Catalogue", href: "/dashboard/catalogue", count: "catalogues" },
  { title: "Settings", href: "/dashboard/settings" },
];
