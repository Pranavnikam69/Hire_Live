"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

function UserSync() {
  const { user } = useUser();
  const syncUser = useMutation(api.users.syncUser);

  useEffect(() => {
    const sync = async () => {
      if (!user) return;

      try {
        await syncUser({
          name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username || "Unknown",
          email: user.emailAddresses[0].emailAddress,
          clerkId: user.id,
          image: user.imageUrl,
        });
      } catch (error) {
        console.error("Error syncing user:", error);
      }
    };

    sync();
  }, [user, syncUser]);

  return null;
}

export default UserSync;
