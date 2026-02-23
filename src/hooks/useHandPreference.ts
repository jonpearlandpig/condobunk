import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type HandPreference = "left" | "right";

export function useHandPreference() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: handPreference = "right" } = useQuery({
    queryKey: ["hand-preference", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("hand_preference")
        .eq("id", user!.id)
        .single();
      return ((data as any)?.hand_preference as HandPreference) || "right";
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });

  const setHandPreference = async (pref: HandPreference) => {
    if (!user) return;
    // Optimistic update
    queryClient.setQueryData(["hand-preference", user.id], pref);
    await supabase
      .from("profiles")
      .update({ hand_preference: pref } as any)
      .eq("id", user.id);
  };

  return { handPreference: handPreference as HandPreference, setHandPreference };
}
