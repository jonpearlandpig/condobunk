import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface ResponsiveDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const ResponsiveDialog = ({ children, ...props }: ResponsiveDialogProps) => {
  const isMobile = useIsMobile();
  const Root = isMobile ? Drawer : Dialog;
  return <Root {...props}>{children}</Root>;
};

const ResponsiveDialogTrigger = ({ children, ...props }: React.ComponentProps<typeof DialogTrigger>) => {
  const isMobile = useIsMobile();
  const Trigger = isMobile ? DrawerTrigger : DialogTrigger;
  return <Trigger {...props}>{children}</Trigger>;
};

const ResponsiveDialogContent = ({
  children,
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <DrawerContent className={`max-h-[90dvh] flex flex-col ${className || ""}`}>
        {children}
      </DrawerContent>
    );
  }
  return (
    <DialogContent className={className} {...props}>
      {children}
    </DialogContent>
  );
};

const ResponsiveDialogHeader = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile();
  const Header = isMobile ? DrawerHeader : DialogHeader;
  return <Header {...props}>{children}</Header>;
};

const ResponsiveDialogTitle = ({ children, ...props }: React.ComponentProps<typeof DialogTitle>) => {
  const isMobile = useIsMobile();
  const Title = isMobile ? DrawerTitle : DialogTitle;
  return <Title {...props}>{children}</Title>;
};

const ResponsiveDialogDescription = ({ children, ...props }: React.ComponentProps<typeof DialogDescription>) => {
  const isMobile = useIsMobile();
  const Desc = isMobile ? DrawerDescription : DialogDescription;
  return <Desc {...props}>{children}</Desc>;
};

const ResponsiveDialogFooter = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile();
  const Footer = isMobile ? DrawerFooter : DialogFooter;
  return <Footer {...props}>{children}</Footer>;
};

const ResponsiveDialogClose = ({ children, ...props }: React.ComponentProps<typeof DialogClose>) => {
  const isMobile = useIsMobile();
  const Close = isMobile ? DrawerClose : DialogClose;
  return <Close {...props}>{children}</Close>;
};

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogClose,
};
