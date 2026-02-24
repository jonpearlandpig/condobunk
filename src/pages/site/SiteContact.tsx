import { useState } from "react";
import { motion } from "framer-motion";
import { Send, Radio } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  message: z.string().trim().min(1, "Message is required").max(2000),
});

type FormValues = z.infer<typeof schema>;

const SiteContact = () => {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", message: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    const { error } = await supabase
      .from("site_inquiries" as any)
      .insert([values] as any);

    setSubmitting(false);
    if (error) {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } else {
      setSubmitted(true);
      toast({ title: "Message sent!", description: "We'll get back to you soon." });
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.div
        className="mb-16 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="mb-4 text-4xl font-bold text-foreground">
          Let's talk <span className="text-gradient-amber">tour.</span>
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Questions about CondoBunk? Want a walkthrough? Drop us a line.
        </p>
      </motion.div>

      <div className="grid gap-12 md:grid-cols-2">
        {/* Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          {submitted ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border/50 bg-card p-12 text-center">
              <Send className="mb-4 h-12 w-12 text-primary" />
              <h3 className="mb-2 text-xl font-bold text-foreground">Message received!</h3>
              <p className="text-sm text-muted-foreground">We'll be in touch shortly.</p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea placeholder="What can we help with?" rows={5} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full glow-amber" disabled={submitting}>
                  {submitting ? "Sending…" : "Send Message"}
                </Button>
              </form>
            </Form>
          )}
        </motion.div>

        {/* Demo CTA */}
        <motion.div
          className="flex flex-col items-start justify-center rounded-2xl border border-border/50 bg-card p-8"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Radio className="mb-4 h-10 w-10 text-primary" />
          <h3 className="mb-2 text-xl font-bold text-foreground">Want to see it live?</h3>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            Try the 24-hour demo with real tour data. Browse the AKB, ask TELA questions, 
            and see how CondoBunk replaces your spreadsheet stack.
          </p>
          <Button asChild>
            <Link to="/login">REQUEST A DEMO</Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default SiteContact;
