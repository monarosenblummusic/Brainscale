import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES, GAME_BY_ID, isGameId } from "@/lib/games";
import { PlayRouter } from "@/components/games/play-router";

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isGameId(slug)) return {};
  return { title: `Playing ${GAME_BY_ID[slug].name}`, robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isGameId(slug)) notFound();
  return <PlayRouter gameId={slug} />;
}
