import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import InviteAccept from "./pages/InviteAccept";
import BunkLayout from "./pages/bunk/BunkLayout";
import BunkOverview from "./pages/bunk/BunkOverview";
import BunkCalendar from "./pages/bunk/BunkCalendar";
import BunkChat from "./pages/bunk/BunkChat";
import BunkDocuments from "./pages/bunk/BunkDocuments";
import BunkGaps from "./pages/bunk/BunkGaps";
import BunkConflicts from "./pages/bunk/BunkConflicts";
import BunkCoverage from "./pages/bunk/BunkCoverage";
import BunkAdmin from "./pages/bunk/BunkAdmin";
import BunkSetup from "./pages/bunk/BunkSetup";
import BunkArtifacts from "./pages/bunk/BunkArtifacts";
import BunkNotificationSettings from "./pages/bunk/BunkNotificationSettings";
import BunkChangeLog from "./pages/bunk/BunkChangeLog";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const RootRedirect = () => {
  // If there are auth params in the URL (OAuth callback), let Supabase process them
  // before redirecting, to avoid a race condition with ProtectedRoute
  const hasAuthParams =
    window.location.hash?.includes("access_token") ||
    window.location.search?.includes("code=");

  if (hasAuthParams) {
    // Render nothing; onAuthStateChange in useAuth will pick up the session
    // and Login's useEffect will redirect to /bunk
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/bunk" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route
              path="/bunk"
              element={
                <ProtectedRoute>
                  <BunkLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<BunkOverview />} />
              <Route path="calendar" element={<BunkCalendar />} />
              <Route path="chat" element={<BunkChat />} />
              <Route path="documents" element={<BunkDocuments />} />
              <Route path="gaps" element={<BunkGaps />} />
              <Route path="conflicts" element={<BunkConflicts />} />
              <Route path="coverage" element={<BunkCoverage />} />
              <Route path="admin" element={<BunkAdmin />} />
              <Route path="setup" element={<BunkSetup />} />
              <Route path="artifacts" element={<BunkArtifacts />} />
              <Route path="notifications" element={<BunkNotificationSettings />} />
              <Route path="changelog" element={<BunkChangeLog />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
