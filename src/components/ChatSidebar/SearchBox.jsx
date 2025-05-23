import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox({ searchQuery, onSearchChange }) {
  return (
    <div className="p-4 border-b border-slate-700">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search conversations..."
          className="pl-9 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
