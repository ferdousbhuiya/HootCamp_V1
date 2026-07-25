# backend/recommendation_engine.py
"""
Skills Pathfinder - Career Recommendation Engine
Maps extracted skills to career paths with actionable recommendations.
"""

# Comprehensive Career Knowledge Base
CAREER_PATHS = [
    {
        "id": "electrical_engineer",
        "path": "Electrical Engineer",
        "category": "Engineering",
        "required_skills": [
            "Power Distribution", "Overhead Lines", "HSE Compliance", 
            "Project Management", "AutoCAD", "Troubleshooting"
        ],
        "job_outlook": "7% growth (2022-2032)",
        "median_salary": "$104,630",
        "top_locations": ["Texas", "California", "Florida", "New York"],
        "recommended_certifications": [
            {
                "name": "Professional Engineer (PE) License",
                "provider": "NCEES",
                "time": "4-6 years experience + exam",
                "cost": "$300-$1,000",
                "url": "https://www.ncees.org/engineering/licensing"
            },
            {
                "name": "IEEE Senior Member",
                "provider": "IEEE",
                "time": "5+ years experience",
                "cost": "$100/year",
                "url": "https://www.ieee.org/membership"
            },
            {
                "name": "Project Management Professional (PMP)",
                "provider": "PMI",
                "time": "3-6 months preparation",
                "cost": "$405-$575",
                "url": "https://www.pmi.org/certifications/pmp"
            }
        ],
        "recommended_degrees": [
            {
                "name": "Master of Science in Electrical Engineering",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "MBA with Engineering Management Focus",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Complete PE exam preparation and schedule your exam",
            "Join IEEE and attend local chapter meetings for networking",
            "Apply for senior electrical engineer roles in power distribution",
            "Consider pursuing a Master's degree for advancement to management",
            "Build a portfolio of completed projects with measurable outcomes"
        ],
        "learning_resources": [
            {"name": "IEEE Power & Energy Society Courses", "type": "Online", "cost": "Free-$200"},
            {"name": "Coursera: Power Systems Specialization", "type": "Online", "cost": "$49/month"},
            {"name": "Udemy: AutoCAD for Electrical Engineers", "type": "Online", "cost": "$15-$20"}
        ]
    },
    {
        "id": "data_analyst",
        "path": "Data Analyst",
        "category": "Data & Analytics",
        "required_skills": [
            "Python", "SQL", "Power BI", "Tableau", "Data Analytics", "Advanced Excel"
        ],
        "job_outlook": "23% growth (2022-2032)",
        "median_salary": "$93,750",
        "top_locations": ["California", "New York", "Texas", "Washington"],
        "recommended_certifications": [
            {
                "name": "Google Data Analytics Professional Certificate",
                "provider": "Google/Coursera",
                "time": "6 months",
                "cost": "$49/month",
                "url": "https://www.coursera.org/professional-certificates/google-data-analytics"
            },
            {
                "name": "Microsoft Certified: Data Analyst Associate",
                "provider": "Microsoft",
                "time": "2-3 months preparation",
                "cost": "$165",
                "url": "https://learn.microsoft.com/certifications/data-analyst-associate/"
            },
            {
                "name": "Tableau Desktop Specialist",
                "provider": "Tableau",
                "time": "1-2 months preparation",
                "cost": "$100",
                "url": "https://www.tableau.com/learn/certification"
            }
        ],
        "recommended_degrees": [
            {
                "name": "Master of Science in Data Science",
                "type": "Master's Degree",
                "duration": "1-2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "Master of Business Analytics",
                "type": "Master's Degree",
                "duration": "1 year",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Complete Google Data Analytics Professional Certificate",
            "Build a portfolio with 3-5 data analysis projects on GitHub",
            "Learn advanced SQL and Python libraries (Pandas, NumPy)",
            "Apply for junior data analyst positions",
            "Network with data professionals on LinkedIn"
        ],
        "learning_resources": [
            {"name": "Kaggle Learn: Python & SQL", "type": "Online", "cost": "Free"},
            {"name": "DataCamp: Data Analyst Track", "type": "Online", "cost": "$25/month"},
            {"name": "Coursera: IBM Data Science Professional Certificate", "type": "Online", "cost": "$49/month"}
        ]
    },
    {
        "id": "electrical_engineering_manager",
        "path": "Electrical Engineering Manager",
        "category": "Engineering Management",
        "required_skills": [
            "Project Management", "Team Leadership", "Budget Management", 
            "HSE Compliance", "Power Distribution", "Stakeholder Collaboration"
        ],
        "job_outlook": "4% growth (2022-2032)",
        "median_salary": "$156,350",
        "top_locations": ["California", "Texas", "New York", "Illinois"],
        "recommended_certifications": [
            {
                "name": "Project Management Professional (PMP)",
                "provider": "PMI",
                "time": "3-6 months preparation",
                "cost": "$405-$575",
                "url": "https://www.pmi.org/certifications/pmp"
            },
            {
                "name": "Six Sigma Green Belt",
                "provider": "ASQ",
                "time": "2-4 months",
                "cost": "$500-$2,000",
                "url": "https://asq.org/cert/six-sigma-green-belt"
            },
            {
                "name": "Certified Engineering Manager (CEM)",
                "provider": "ASME",
                "time": "6-12 months",
                "cost": "$300-$500",
                "url": "https://www.asme.org"
            }
        ],
        "recommended_degrees": [
            {
                "name": "MBA with Engineering Management",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "Master of Engineering Management (MEM)",
                "type": "Master's Degree",
                "duration": "1-2 years",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Complete PMP certification to validate project management skills",
            "Seek leadership opportunities in your current role",
            "Pursue an MBA or Master of Engineering Management",
            "Network with engineering managers through professional associations",
            "Develop financial acumen and budget management skills"
        ],
        "learning_resources": [
            {"name": "PMI: Project Management Fundamentals", "type": "Online", "cost": "Free-$200"},
            {"name": "Harvard Business Review: Leadership Courses", "type": "Online", "cost": "$50-$200"},
            {"name": "Coursera: Engineering Management Specialization", "type": "Online", "cost": "$49/month"}
        ]
    },
    {
        "id": "power_systems_engineer",
        "path": "Power Systems Engineer",
        "category": "Specialized Engineering",
        "required_skills": [
            "Power Distribution", "MV Electrical Power Distribution", 
            "Overhead Lines", "Underground Cabling", "AutoCAD", "GIS"
        ],
        "job_outlook": "9% growth (2022-2032)",
        "median_salary": "$115,000",
        "top_locations": ["Texas", "California", "Florida", "Arizona"],
        "recommended_certifications": [
            {
                "name": "Professional Engineer (PE) - Power",
                "provider": "NCEES",
                "time": "4-6 years experience + exam",
                "cost": "$300-$1,000",
                "url": "https://www.ncees.org"
            },
            {
                "name": "Certified Energy Manager (CEM)",
                "provider": "AEE",
                "time": "3-6 months",
                "cost": "$600-$800",
                "url": "https://www.aeecenter.org"
            },
            {
                "name": "NABCEP PV Installation Professional",
                "provider": "NABCEP",
                "time": "6-12 months",
                "cost": "$350",
                "url": "https://www.nabcep.org"
            }
        ],
        "recommended_degrees": [
            {
                "name": "Master of Science in Power Systems Engineering",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "Master of Science in Renewable Energy",
                "type": "Master's Degree",
                "duration": "1-2 years",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Obtain PE license with power systems specialization",
            "Gain experience with renewable energy integration",
            "Learn advanced power system simulation tools (ETAP, PSS/E)",
            "Consider specializing in smart grid technologies",
            "Join IEEE Power & Energy Society"
        ],
        "learning_resources": [
            {"name": "IEEE Power & Energy Society", "type": "Professional Org", "cost": "$50-$150/year"},
            {"name": "Coursera: Power Systems Specialization", "type": "Online", "cost": "$49/month"},
            {"name": "Udemy: Power System Analysis", "type": "Online", "cost": "$15-$20"}
        ]
    },
    {
        "id": "renewable_energy_engineer",
        "path": "Renewable Energy Engineer",
        "category": "Green Energy",
        "required_skills": [
            "Solar Power System Installation", "Power Distribution", 
            "Project Management", "HSE Compliance", "AutoCAD"
        ],
        "job_outlook": "15% growth (2022-2032)",
        "median_salary": "$102,000",
        "top_locations": ["California", "Texas", "Florida", "Arizona", "Nevada"],
        "recommended_certifications": [
            {
                "name": "NABCEP PV Installation Professional",
                "provider": "NABCEP",
                "time": "6-12 months",
                "cost": "$350",
                "url": "https://www.nabcep.org"
            },
            {
                "name": "LEED Green Associate",
                "provider": "USGBC",
                "time": "2-3 months",
                "cost": "$250",
                "url": "https://www.usgbc.org/credentials"
            },
            {
                "name": "Certified Energy Manager (CEM)",
                "provider": "AEE",
                "time": "3-6 months",
                "cost": "$600-$800",
                "url": "https://www.aeecenter.org"
            }
        ],
        "recommended_degrees": [
            {
                "name": "Master of Science in Renewable Energy",
                "type": "Master's Degree",
                "duration": "1-2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "Master of Science in Sustainable Energy",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Obtain NABCEP certification for solar installations",
            "Gain experience with battery storage systems",
            "Learn about grid integration and smart grid technologies",
            "Network with renewable energy professionals",
            "Consider specializing in wind or solar energy"
        ],
        "learning_resources": [
            {"name": "NABCEP Study Resources", "type": "Online", "cost": "Free-$200"},
            {"name": "Coursera: Renewable Energy Specialization", "type": "Online", "cost": "$49/month"},
            {"name": "edX: Sustainable Energy", "type": "Online", "cost": "Free-$200"}
        ]
    },
    {
        "id": "software_tester",
        "path": "Software Test Engineer",
        "category": "Software & IT",
        "required_skills": [
            "Selenium", "Java", "SQL", "Software Testing", "Automation"
        ],
        "job_outlook": "25% growth (2022-2032)",
        "median_salary": "$99,000",
        "top_locations": ["California", "Washington", "Texas", "New York"],
        "recommended_certifications": [
            {
                "name": "ISTQB Certified Tester",
                "provider": "ISTQB",
                "time": "2-3 months",
                "cost": "$200-$300",
                "url": "https://www.istqb.org"
            },
            {
                "name": "Certified Selenium Professional",
                "provider": "Various",
                "time": "1-2 months",
                "cost": "$100-$300",
                "url": "https://www.selenium.dev"
            },
            {
                "name": "AWS Certified Cloud Practitioner",
                "provider": "AWS",
                "time": "1-2 months",
                "cost": "$100",
                "url": "https://aws.amazon.com/certification"
            }
        ],
        "recommended_degrees": [
            {
                "name": "Master of Science in Computer Science",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "Master of Science in Software Engineering",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Complete ISTQB certification for foundational testing knowledge",
            "Build a portfolio of automated test frameworks",
            "Learn CI/CD tools (Jenkins, GitLab CI)",
            "Gain experience with API testing (Postman, REST Assured)",
            "Apply for software test engineer positions"
        ],
        "learning_resources": [
            {"name": "Selenium Documentation & Tutorials", "type": "Online", "cost": "Free"},
            {"name": "Udemy: Selenium WebDriver with Java", "type": "Online", "cost": "$15-$20"},
            {"name": "Coursera: Software Testing and Automation", "type": "Online", "cost": "$49/month"}
        ]
    },
    {
        "id": "project_manager_engineering",
        "path": "Engineering Project Manager",
        "category": "Project Management",
        "required_skills": [
            "Project Management", "Stakeholder Collaboration", "Budget Management",
            "HSE Compliance", "Team Leadership", "Risk Management"
        ],
        "job_outlook": "6% growth (2022-2032)",
        "median_salary": "$135,000",
        "top_locations": ["California", "Texas", "New York", "Illinois", "Florida"],
        "recommended_certifications": [
            {
                "name": "Project Management Professional (PMP)",
                "provider": "PMI",
                "time": "3-6 months preparation",
                "cost": "$405-$575",
                "url": "https://www.pmi.org/certifications/pmp"
            },
            {
                "name": "Certified ScrumMaster (CSM)",
                "provider": "Scrum Alliance",
                "time": "2 days training + exam",
                "cost": "$1,000-$1,500",
                "url": "https://www.scrumalliance.org"
            },
            {
                "name": "Six Sigma Green Belt",
                "provider": "ASQ",
                "time": "2-4 months",
                "cost": "$500-$2,000",
                "url": "https://asq.org/cert/six-sigma-green-belt"
            }
        ],
        "recommended_degrees": [
            {
                "name": "MBA with Project Management Focus",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "Master of Science in Project Management",
                "type": "Master's Degree",
                "duration": "1-2 years",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Complete PMP certification to validate project management expertise",
            "Gain experience managing larger, more complex projects",
            "Develop financial acumen and budget management skills",
            "Network with project managers through PMI chapters",
            "Consider pursuing an MBA for executive-level positions"
        ],
        "learning_resources": [
            {"name": "PMI: Project Management Fundamentals", "type": "Online", "cost": "Free-$200"},
            {"name": "Coursera: Google Project Management Certificate", "type": "Online", "cost": "$49/month"},
            {"name": "LinkedIn Learning: Project Management Foundations", "type": "Online", "cost": "$30/month"}
        ]
    },
    {
        "id": "controls_engineer",
        "path": "Controls/Automation Engineer",
        "category": "Automation & Control",
        "required_skills": [
            "Troubleshooting", "Electrical Systems", "Mechanical Systems",
            "AutoCAD", "Python", "Project Management"
        ],
        "job_outlook": "8% growth (2022-2032)",
        "median_salary": "$108,000",
        "top_locations": ["Michigan", "Ohio", "Texas", "California", "Illinois"],
        "recommended_certifications": [
            {
                "name": "Certified Automation Professional (CAP)",
                "provider": "ISA",
                "time": "3-6 months",
                "cost": "$400-$600",
                "url": "https://www.isa.org/certification"
            },
            {
                "name": "Siemens PLC Programming Certification",
                "provider": "Siemens",
                "time": "2-4 months",
                "cost": "$500-$1,000",
                "url": "https://www.siemens.com"
            },
            {
                "name": "Rockwell Automation Certification",
                "provider": "Rockwell",
                "time": "2-4 months",
                "cost": "$500-$1,000",
                "url": "https://www.rockwellautomation.com"
            }
        ],
        "recommended_degrees": [
            {
                "name": "Master of Science in Control Systems Engineering",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            },
            {
                "name": "Master of Science in Mechatronics",
                "type": "Master's Degree",
                "duration": "2 years",
                "format": "Online/On-campus"
            }
        ],
        "next_steps": [
            "Learn PLC programming (Siemens, Rockwell, Allen-Bradley)",
            "Gain experience with SCADA and HMI systems",
            "Obtain CAP certification from ISA",
            "Learn industrial networking protocols (Modbus, Profibus)",
            "Apply for controls engineer positions in manufacturing"
        ],
        "learning_resources": [
            {"name": "ISA: Automation Fundamentals", "type": "Online", "cost": "Free-$300"},
            {"name": "Udemy: PLC Programming from Scratch", "type": "Online", "cost": "$15-$20"},
            {"name": "Coursera: Industrial IoT", "type": "Online", "cost": "$49/month"}
        ]
    }
]


def calculate_match_score(extracted_skills, required_skills):
    """
    Calculate match score between extracted skills and required skills.
    Returns a score between 0 and 1, plus lists of matched and missing skills.
    """
    extracted_names = [skill["name"].lower() for skill in extracted_skills]
    required_lower = [skill.lower() for skill in required_skills]
    
    matched_skills = []
    missing_skills = []
    
    for skill in required_skills:
        skill_lower = skill.lower()
        # Check for exact match or partial match
        if skill_lower in extracted_names:
            matched_skills.append(skill)
        elif any(skill_lower in name or name in skill_lower for name in extracted_names):
            matched_skills.append(skill)
        else:
            missing_skills.append(skill)
    
    if len(required_skills) == 0:
        return 0.0, matched_skills, missing_skills
    
    match_score = len(matched_skills) / len(required_skills)
    return match_score, matched_skills, missing_skills


def get_career_recommendations(extracted_skills, top_n=5):
    """
    Analyze extracted skills and return relevant career paths with recommendations.
    """
    recommendations = []
    
    for career in CAREER_PATHS:
        match_score, matched_skills, missing_skills = calculate_match_score(
            extracted_skills, 
            career["required_skills"]
        )
        
        # Only include careers with at least 30% match
        if match_score >= 0.3:
            recommendations.append({
                "id": career["id"],
                "path": career["path"],
                "category": career["category"],
                "match_score": match_score,
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
                "job_outlook": career["job_outlook"],
                "median_salary": career["median_salary"],
                "top_locations": career["top_locations"],
                "recommended_certifications": career["recommended_certifications"],
                "recommended_degrees": career["recommended_degrees"],
                "next_steps": career["next_steps"],
                "learning_resources": career["learning_resources"]
            })
    
    # Sort by match score (highest first)
    recommendations.sort(key=lambda x: x["match_score"], reverse=True)
    
    # Return top N recommendations
    return recommendations[:top_n]


def get_skill_gap_analysis(extracted_skills, target_career_id):
    """
    Get detailed skill gap analysis for a specific career path.
    """
    target_career = None
    for career in CAREER_PATHS:
        if career["id"] == target_career_id:
            target_career = career
            break
    
    if not target_career:
        return None
    
    match_score, matched_skills, missing_skills = calculate_match_score(
        extracted_skills,
        target_career["required_skills"]
    )
    
    return {
        "career": target_career["path"],
        "match_score": match_score,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "recommended_certifications": target_career["recommended_certifications"],
        "next_steps": target_career["next_steps"]
    }