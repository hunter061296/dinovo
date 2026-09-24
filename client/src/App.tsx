import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { FloorPlanPage } from "./pages/FloorPlanPage";
import { FloorPlanSettingsPage } from "./pages/FloorPlanSettingsPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { WaitlistPage } from "./pages/WaitlistPage";
import { GuestbookPage } from "./pages/GuestbookPage";
import { GuestProfilePage } from "./pages/GuestProfilePage";
import { ShiftsPage } from "./pages/ShiftsPage";
import { ReportsPage } from "./pages/ReportsPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/floor-plan" element={<FloorPlanPage />} />
              <Route path="/reservations" element={<ReservationsPage />} />
              <Route path="/waitlist" element={<WaitlistPage />} />
              <Route path="/guests" element={<GuestbookPage />} />
              <Route path="/guests/:id" element={<GuestProfilePage />} />

              <Route element={<ProtectedRoute roles={["ADMIN", "MANAGER"]} />}>
                <Route path="/floor-plan/settings" element={<FloorPlanSettingsPage />} />
                <Route path="/shifts" element={<ShiftsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
