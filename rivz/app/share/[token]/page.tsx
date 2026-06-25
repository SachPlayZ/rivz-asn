import { SharedTaskClient } from "./_components/SharedTaskClient";

export async function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default async function SharedTaskPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedTaskClient token={token} />;
}
