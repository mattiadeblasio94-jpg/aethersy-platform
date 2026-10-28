import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Header } from "./Header";
import { Drawer } from "./Drawer";
import { BottomNav } from "./BottomNav";
import { Fab } from "./Fab";
import { useUiStore } from "@pv/store/ui";

/**
 * Shell dell'area autenticata (brief §2). Compone:
 *  - Header sticky
 *  - Drawer mobile (AnimatePresence + overlay) e sidebar desktop
 *  - Contenuto della route corrente (<Outlet/>)
 *  - BottomNav + Fab su mobile
 *
 * Il main riserva spazio per header, sidebar, bottom nav e safe-area cosi' il
 * contenuto non viene mai coperto su mobile.
 */
export function Shell() {
  const drawerOpen = useUiStore((state) => state.drawerOpen);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const location = useLocation();

  // Chiude il drawer ad ogni cambio route (mobile).
  useEffect(() => {
    closeDrawer();
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname, closeDrawer]);

  // Blocca lo scroll del body quando il drawer mobile e' aperto.
  useEffect(() => {
    if (drawerOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh">
      <Header />

      <div className="flex">
        {/* Sidebar persistente su desktop. */}
        <Drawer variant="desktop" />

        <main
          className="min-w-0 flex-1"
          style={{
            paddingTop: "0px",
            paddingBottom: "calc(var(--bottom-nav-height) + var(--safe-bottom) + 16px)",
          }}
        >
          <div className="mx-auto w-full max-w-content px-4 py-5 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Overlay sfocato del drawer mobile (chiude al click). */}
      {drawerOpen && (
        <div
          role="presentation"
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Drawer mobile animato: AnimatePresence gestisce l'uscita. */}
      <AnimatePresence>
        {drawerOpen && <Drawer key="drawer-mobile" variant="mobile" />}
      </AnimatePresence>

      <BottomNav />
      <Fab />
    </div>
  );
}
