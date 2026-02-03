import highlaneLogo from "@/assets/highlane-logo.jpeg";

interface CompanyHeaderProps {
  showTagline?: boolean;
  size?: "small" | "medium" | "large";
  className?: string;
}

export default function CompanyHeader({ 
  showTagline = true, 
  size = "medium",
  className = "" 
}: CompanyHeaderProps) {
  const logoSizes = {
    small: "h-10 w-10",
    medium: "h-16 w-16",
    large: "h-20 w-20"
  };

  const titleSizes = {
    small: "text-lg",
    medium: "text-2xl",
    large: "text-3xl"
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img 
        src={highlaneLogo} 
        alt="Highlane Constructions" 
        className={`${logoSizes[size]} object-contain mb-2`}
      />
      <h1 className={`${titleSizes[size]} font-bold text-gray-900`}>
        Highlane Constructions Pvt Ltd
      </h1>
      {showTagline && (
        <p className="text-sm text-gray-500 mt-1">Material Dispatch Management System</p>
      )}
    </div>
  );
}
