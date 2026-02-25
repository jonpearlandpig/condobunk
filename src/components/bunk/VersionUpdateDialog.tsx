import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { FileText, ArrowUpCircle, Copy } from "lucide-react";

interface VersionUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFilename: string;
  existingDate: string;
  existingVersion: number;
  onUploadAsNewVersion: () => void;
  onUploadAsSeparate: () => void;
}

const VersionUpdateDialog = ({
  open,
  onOpenChange,
  existingFilename,
  existingDate,
  existingVersion,
  onUploadAsNewVersion,
  onUploadAsSeparate,
}: VersionUpdateDialogProps) => {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2 font-mono text-sm tracking-wider">
            <FileText className="h-4 w-4 text-primary" />
            UPDATE DETECTED
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-sm">
            <span className="font-medium text-foreground">"{existingFilename}"</span>{" "}
            already exists (v{existingVersion}, uploaded{" "}
            {new Date(existingDate).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            ).
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
            <p className="text-xs font-mono font-medium text-primary tracking-wider">
              NEW VERSION
            </p>
            <p className="text-xs text-muted-foreground">
              Archives the old version, extracts the new one, and shows you exactly what changed.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-mono font-medium text-muted-foreground tracking-wider">
              SEPARATE DOCUMENT
            </p>
            <p className="text-xs text-muted-foreground">
              Keeps the old document as-is. Creates a completely independent entry.
            </p>
          </div>
        </div>

        <ResponsiveDialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs gap-1.5"
            onClick={() => {
              onUploadAsSeparate();
              onOpenChange(false);
            }}
          >
            <Copy className="h-3 w-3" />
            Upload as Separate
          </Button>
          <Button
            size="sm"
            className="font-mono text-xs gap-1.5"
            onClick={() => {
              onUploadAsNewVersion();
              onOpenChange(false);
            }}
          >
            <ArrowUpCircle className="h-3 w-3" />
            Upload as New Version
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

export default VersionUpdateDialog;
