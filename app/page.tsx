import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import NotionPages from "./notion-pages"; 

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="fixed top-0 left-0 right-0 bottom-0 pointer-events-none">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-1/3 w-96 h-96 bg-indigo-600/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-20 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Navigation Bar */}
      <nav className="bg-zinc-900/60 backdrop-blur-lg border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            {/* Logo/Brand */}
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500">
                CodeStory
              </h1>
            </div>
            
            {/* Right-side navigation */}
            <div className="flex items-center space-x-4">
              {/* User button */}
              <UserButton 
                afterSignOutUrl="/sign-in"
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-9 h-9"
                  }
                }}
              />
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Notion Pages Component */}
        <NotionPages />
      </main>
    </div>
  );
}