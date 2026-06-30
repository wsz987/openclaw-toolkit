import { compare, gt, valid } from 'semver';

export type DesktopUpdateAssetCandidate = {
  target: string;
  arch: string;
  enabled: boolean;
  url: string;
  signature: string;
};

export type DesktopUpdateCandidate = {
  version: string;
  enabled: boolean;
  channel: string;
  notes: string | null;
  pubDate: string;
  asset: DesktopUpdateAssetCandidate;
};

export type DesktopUpdateRequest = {
  currentVersion: string;
  target: string;
  arch: string;
  channel: string;
};

export type TauriUpdateResponse = {
  version: string;
  notes: string | null;
  pub_date: string;
  url: string;
  signature: string;
};

export function selectDesktopUpdate(
  candidates: DesktopUpdateCandidate[],
  request: DesktopUpdateRequest
): TauriUpdateResponse | null {
  const currentVersion = valid(request.currentVersion);
  if (!currentVersion) {
    return null;
  }

  const compatible = candidates
    .filter((candidate) => {
      const candidateVersion = valid(candidate.version);
      return Boolean(
        candidateVersion &&
          candidate.enabled &&
          candidate.channel === request.channel &&
          gt(candidateVersion, currentVersion) &&
          candidate.asset.enabled &&
          candidate.asset.target === request.target &&
          candidate.asset.arch === request.arch
      );
    })
    .sort((left, right) => compare(right.version, left.version));

  const selected = compatible[0];
  if (!selected) {
    return null;
  }

  return {
    version: selected.version,
    notes: selected.notes,
    pub_date: selected.pubDate,
    url: selected.asset.url,
    signature: selected.asset.signature
  };
}
