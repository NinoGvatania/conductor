"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ProjectContextValue {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  projectId: null,
  setProjectId: () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdRaw] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("currentProjectId") || null;
    }
    return null;
  });

  const setProjectId = useCallback((id: string | null) => {
    setProjectIdRaw(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem("currentProjectId", id);
      else localStorage.removeItem("currentProjectId");
    }
  }, []);

  return (
    <ProjectContext.Provider value={{ projectId, setProjectId }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
