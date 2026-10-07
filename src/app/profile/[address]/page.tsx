import { WalletProfileView } from "@/features/profile/wallet-profile-view";

type ProfilePageProps = {
  params: Promise<{ address: string }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { address } = await params;
  return (
    <main className="market-page mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-7xl flex-col gap-4">
      <WalletProfileView address={address} />
    </main>
  );
}
