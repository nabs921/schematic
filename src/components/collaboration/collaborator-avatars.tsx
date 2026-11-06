'use client';

import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface Collaborator {
  id: string;
  name: string;
  email: string;
  color: string;
  role?: string;
  isSelf?: boolean;
  activity?: string;
}

interface CollaboratorAvatarsProps {
  collaborators: Collaborator[];
}

export function CollaboratorAvatars({ collaborators }: CollaboratorAvatarsProps) {
  if (collaborators.length === 0) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center -space-x-2 overflow-hidden px-1">
        {collaborators.map((user) => {
          const isActivelyEditing =
            Boolean(user.activity) &&
            user.activity !== 'Viewing schema' &&
            user.activity !== 'Idle' &&
            !user.isSelf;

          return (
            <Tooltip key={user.id}>
              <TooltipTrigger asChild>
                <div
                  className="relative h-7 w-7 rounded-full border-2 border-[#070b14] flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-md select-none cursor-pointer transition-transform hover:scale-110 hover:z-10"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0)}
                  <span
                    className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[#070b14] ${
                      isActivelyEditing
                        ? 'bg-amber-400 animate-pulse ring-1 ring-amber-400'
                        : 'bg-emerald-500'
                    }`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-100 p-2.5 shadow-xl max-w-xs z-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-100">
                    {user.name} {user.isSelf && <span className="text-zinc-400 font-normal">(You)</span>}
                  </span>
                  {user.role && (
                    <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-zinc-800 text-indigo-300 font-mono">
                      {user.role}
                    </span>
                  )}
                </div>
                {user.email && (
                  <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{user.email}</p>
                )}
                {user.activity && (
                  <div className="mt-2 pt-1.5 border-t border-zinc-800/80 flex items-center gap-1.5 text-[11px] text-indigo-300">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isActivelyEditing ? 'bg-amber-400 animate-ping' : 'bg-indigo-400'
                      }`}
                    />
                    <span className="font-medium">{user.activity}</span>
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
