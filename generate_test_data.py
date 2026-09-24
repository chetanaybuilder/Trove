import random
import datetime

speakers = ["Alex", "Jordan", "Taylor", "Casey", "Morgan", "Sam"]
projects = ["Project Alpha", "Project Beta", "Trove Migration", "Q3 Launch", "Server Overhaul"]
actions = ["review the PR", "schedule a meeting with marketing", "approve the budget", "deploy to production", "fix the auth bug", "update the staging environment", "send the financial report", "call the vendor"]

def generate_mock_data(num_lines=10000):
    start_date = datetime.datetime(2025, 1, 1, 9, 0)
    
    with open("test_data.txt", "w", encoding="utf-8") as f:
        f.write("--- BEGIN MASSIVE LOG ---\n")
        
        for i in range(num_lines):
            # Advance time by 1 to 15 minutes occasionally
            if random.random() > 0.3:
                start_date += datetime.timedelta(minutes=random.randint(1, 15))
                
            speaker = random.choice(speakers)
            
            # Decide what type of message to generate
            msg_type = random.choices(["chat", "commitment", "financial", "alert", "decision"], weights=[80, 10, 3, 2, 5])[0]
            
            ts = start_date.strftime("[%Y-%m-%d %I:%M %p]")
            
            if msg_type == "chat":
                msg = f"Hey everyone, just checking in on {random.choice(projects)}." if random.random() > 0.5 else f"Does anyone have the link to the {random.choice(projects)} docs?"
            elif msg_type == "commitment":
                deadline = (start_date + datetime.timedelta(days=random.randint(1, 14))).strftime("%B %d")
                msg = f"I will {random.choice(actions)} by {deadline}."
            elif msg_type == "financial":
                msg = f"The budget for {random.choice(projects)} has been increased to ${random.randint(10, 500)},000."
            elif msg_type == "alert":
                msg = f"URGENT: The {random.choice(projects)} server just crashed. We need someone to look into this immediately!"
            elif msg_type == "decision":
                msg = f"We've officially decided to move forward with {random.choice(projects)}. Please align your teams."
                
            f.write(f"{ts} {speaker}: {msg}\n")
            
            # Occasionally add a follow-up
            if random.random() > 0.8:
                f.write(f"{ts} {random.choice(speakers)}: Got it, thanks.\n")
                
        f.write("--- END MASSIVE LOG ---\n")

if __name__ == "__main__":
    generate_mock_data(10000)
    print("Generated 10,000+ lines of mock conversation in test_data.txt")
