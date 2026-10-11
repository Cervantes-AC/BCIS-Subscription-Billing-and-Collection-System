CREATE TABLE "subscriber_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"source_payment_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"remaining_amount" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_credits_remaining_nonnegative" CHECK ("subscriber_credits"."remaining_amount" >= 0),
	CONSTRAINT "subscriber_credits_amount_positive" CHECK ("subscriber_credits"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD CONSTRAINT "subscriber_credits_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD CONSTRAINT "subscriber_credits_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD CONSTRAINT "subscriber_credits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_credits_source_payment_id_unique" ON "subscriber_credits" USING btree ("source_payment_id");
--> statement-breakpoint
CREATE INDEX "subscriber_credits_subscriber_idx" ON "subscriber_credits" USING btree ("subscriber_id");
