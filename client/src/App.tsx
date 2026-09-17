import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { FloorPlanPage } from "./pages/FloorPlanPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

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
              <Route path="/waitlist" element={<PlaceholderPage title="Waitlist" phase="Phase 6" />} />
              <Route path="/guests" element={<PlaceholderPage title="Guestbook" phase="Phase 7" />} />

              <Route element={<ProtectedRoute roles={["ADMIN", "MANAGER"]} />}>
                <Route path="/shifts" element={<PlaceholderPage title="Shifts & Pacing" phase="Phase 8" />} />
                <Route path="/reports" element={<PlaceholderPage title="Reports" phase="Phase 9" />} />
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
