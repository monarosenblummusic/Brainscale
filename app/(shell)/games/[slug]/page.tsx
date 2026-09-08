import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES, GAME_BY_ID, isGameId } from "@/lib/games";
import { GameInfo } from "@/components/game-info";
import { GameSettingsPanel } from "@/components/games/settings-panel";

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isGameId(slug)) return {};
  const game = GAME_BY_ID[slug];
  return {
    title: `${game.name} — ${game.tagline}`,
    description: game.about.slice(0, 155),
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isGameId(slug)) notFound();
  return <GameInfo game={GAME_BY_ID[slug]} settings={<GameSettingsPanel gameId={slug} />} />;
}
