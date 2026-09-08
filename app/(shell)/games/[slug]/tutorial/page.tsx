import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES, GAME_BY_ID, isGameId } from "@/lib/games";
import { TutorialRouter } from "@/components/games/tutorial-router";

export function generateStaticParams() {
  return GAMES.filter((g) => g.hasTutorial).map((g) => ({ slug: g.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isGameId(slug)) return {};
  return { title: `How to play ${GAME_BY_ID[slug].name}` };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isGameId(slug) || !GAME_BY_ID[slug].hasTutorial) notFound();
  return <TutorialRouter gameId={slug} />;
}
