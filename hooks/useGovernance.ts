import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

// --- Types ---

export type ProposalScope = 'protocol' | 'client';
export type ProtocolCategory = 'protocol-change' | 'new-feature' | 'deprecation';
export type ClientArea = 'chat' | 'miniapps' | 'feed' | 'profile' | 'other';
export type VoteDirection = 'up' | 'down';

interface ProposalBase {
  id: string;
  scope: ProposalScope;
  title: string;
  createdAt: number;
  authorAddress: string;
  authorName?: string;
  upvotes: number;
  downvotes: number;
}

export interface ProtocolProposal extends ProposalBase {
  scope: 'protocol';
  abstract: string;
  problemStatement: string;
  proposedSolution: string;
  category: ProtocolCategory;
}

export interface ClientProposal extends ProposalBase {
  scope: 'client';
  clientArea: ClientArea;
  description: string;
  rationale: string;
}

export type Proposal = ProtocolProposal | ClientProposal;

type OmitGenerated<T> = Omit<T, 'id' | 'createdAt' | 'upvotes' | 'downvotes'>;
export type CreateProposalInput = OmitGenerated<ProtocolProposal> | OmitGenerated<ClientProposal>;

export interface ProposalComment {
  id: string;
  proposalId: string;
  authorAddress: string;
  authorName?: string;
  text: string;
  createdAt: number;
}

export type VoteMap = Record<string, VoteDirection>;

// --- Storage ---

const storage = createMMKV({ id: 'governance-proposals' });

const PROPOSALS_KEY = 'proposals';
const votesKey = (addr: string) => `votes:${addr}`;
const commentsKey = (proposalId: string) => `comments:${proposalId}`;

function readProposals(): Proposal[] {
  const raw = storage.getString(PROPOSALS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function writeProposals(proposals: Proposal[]) {
  storage.set(PROPOSALS_KEY, JSON.stringify(proposals));
}

function readVotes(userAddress: string): VoteMap {
  const raw = storage.getString(votesKey(userAddress));
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function writeVotes(userAddress: string, votes: VoteMap) {
  storage.set(votesKey(userAddress), JSON.stringify(votes));
}

function readComments(proposalId: string): ProposalComment[] {
  const raw = storage.getString(commentsKey(proposalId));
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function writeComments(proposalId: string, comments: ProposalComment[]) {
  storage.set(commentsKey(proposalId), JSON.stringify(comments));
}

// --- Reactive subscription via useSyncExternalStore ---

let listeners: Array<() => void> = [];
let snapshotVersion = 0;

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

function notify() {
  snapshotVersion++;
  listeners.forEach((l) => l());
}

function getSnapshot() {
  return snapshotVersion;
}

// --- Hook ---

export function useGovernance(userAddress: string | undefined) {
  // Re-read from MMKV whenever snapshotVersion changes
  const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const proposals = useMemo(() => readProposals(), [version]);
  const protocolProposals = useMemo(() => proposals.filter((p): p is ProtocolProposal => p.scope === 'protocol'), [proposals]);
  const clientProposals = useMemo(() => proposals.filter((p): p is ClientProposal => p.scope === 'client'), [proposals]);
  const votes = useMemo(() => (userAddress ? readVotes(userAddress) : {} as VoteMap), [userAddress, version]);

  const createProposal = useCallback((proposal: CreateProposalInput) => {
    const newProposal = {
      ...proposal,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      upvotes: 0,
      downvotes: 0,
    } as Proposal;
    const current = readProposals();
    writeProposals([newProposal, ...current]);
    notify();
    return newProposal;
  }, []);

  const getProposal = useCallback((id: string): Proposal | undefined => {
    return proposals.find((p) => p.id === id);
  }, [proposals]);

  const getComments = useCallback((proposalId: string): ProposalComment[] => {
    return readComments(proposalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const addComment = useCallback((proposalId: string, text: string, authorAddress: string, authorName?: string) => {
    const comment: ProposalComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      proposalId,
      authorAddress,
      authorName,
      text,
      createdAt: Date.now(),
    };
    const current = readComments(proposalId);
    writeComments(proposalId, [...current, comment]);
    notify();
  }, []);

  const vote = useCallback((proposalId: string, direction: VoteDirection) => {
    if (!userAddress) return;
    const currentVotes = readVotes(userAddress);
    const existing = currentVotes[proposalId];
    const current = readProposals();
    const idx = current.findIndex((p) => p.id === proposalId);
    if (idx === -1) return;

    const proposal = { ...current[idx] };

    if (existing === direction) {
      // Toggle off
      delete currentVotes[proposalId];
      if (direction === 'up') proposal.upvotes = Math.max(0, proposal.upvotes - 1);
      else proposal.downvotes = Math.max(0, proposal.downvotes - 1);
    } else {
      // Remove old vote if switching
      if (existing === 'up') proposal.upvotes = Math.max(0, proposal.upvotes - 1);
      else if (existing === 'down') proposal.downvotes = Math.max(0, proposal.downvotes - 1);
      // Apply new vote
      currentVotes[proposalId] = direction;
      if (direction === 'up') proposal.upvotes += 1;
      else proposal.downvotes += 1;
    }

    current[idx] = proposal;
    writeProposals(current);
    writeVotes(userAddress, currentVotes);
    notify();
  }, [userAddress]);

  return { proposals, protocolProposals, clientProposals, votes, createProposal, vote, getProposal, getComments, addComment };
}
