import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useLibraryStore } from "./libraryStore";
import { useAuthStore } from "./authStore";

export const MAX_PROFILES = 8;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Profile avatar options - color + icon combos
export const PROFILE_AVATARS = [
  { color: "#6366f1", icon: "😊" },
  { color: "#ef4444", icon: "😎" },
  { color: "#22c55e", icon: "🤩" },
  { color: "#f97316", icon: "🦊" },
  { color: "#a855f7", icon: "🐱" },
  { color: "#ec4899", icon: "🌸" },
  { color: "#06b6d4", icon: "🌊" },
  { color: "#eab308", icon: "⭐" },
  { color: "#3b82f6", icon: "🎮" },
  { color: "#10b981", icon: "🌿" },
  { color: "#f43f5e", icon: "🔥" },
  { color: "#8b5cf6", icon: "🎵" },
] as const;

export interface Profile {
  id: string;
  name: string;
  avatarColor: string;
  avatarIcon: string;
  isKid: boolean;
  createdAt: string;
}

interface ProfileState {
  profiles: Profile[];
  activeProfileId: string | null;

  // Actions
  createProfile: (
    name: string,
    avatarColor: string,
    avatarIcon: string,
    isKid?: boolean,
  ) => Profile | null;
  updateProfile: (
    id: string,
    updates: Partial<
      Pick<Profile, "name" | "avatarColor" | "avatarIcon" | "isKid">
    >,
  ) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  getActiveProfile: () => Profile | null;
  canCreateProfile: () => boolean;

  // Server sync
  syncProfiles: () => Promise<void>;
  loadProfiles: () => Promise<void>;

  // Clear all data (for logout)
  clearAll: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,

      createProfile: (name, avatarColor, avatarIcon, isKid = false) => {
        if (get().profiles.length >= MAX_PROFILES) return null;

        const newProfile: Profile = {
          id: crypto.randomUUID(),
          name: name.trim(),
          avatarColor,
          avatarIcon,
          isKid,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          profiles: [...state.profiles, newProfile],
        }));

        // Sync to server in background
        get().syncProfiles();

        return newProfile;
      },

      updateProfile: (id, updates) => {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...updates,
                  name: updates.name ? updates.name.trim() : p.name,
                }
              : p,
          ),
        }));

        get().syncProfiles();
      },

      deleteProfile: (id) => {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
          // Clear active if deleting active profile
          activeProfileId:
            state.activeProfileId === id ? null : state.activeProfileId,
        }));

        get().syncProfiles();
      },

      setActiveProfile: (id) => {
        set({ activeProfileId: id });
        // Switch library data to the selected profile
        useLibraryStore.getState().switchProfile(id);
      },

      getActiveProfile: () => {
        const { profiles, activeProfileId } = get();
        return profiles.find((p) => p.id === activeProfileId) || null;
      },

      canCreateProfile: () => {
        return get().profiles.length < MAX_PROFILES;
      },

      syncProfiles: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        try {
          await fetch(`${API_URL}/profiles/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authState.token}`,
            },
            body: JSON.stringify({ profiles: get().profiles }),
          });
        } catch (error) {
          console.error("Failed to sync profiles:", error);
        }
      },

      loadProfiles: async () => {
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) return;

        try {
          const res = await fetch(`${API_URL}/profiles`, {
            headers: {
              Authorization: `Bearer ${authState.token}`,
            },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.profiles && data.profiles.length > 0) {
              set({ profiles: data.profiles });
            }
          }
        } catch (error) {
          console.error("Failed to load profiles from server:", error);
        }
      },

      clearAll: () => {
        set({ profiles: [], activeProfileId: null });
      },
    }),
    {
      name: "vreamio-profiles",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
