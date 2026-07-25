import { useState } from 'react';

const SkillDashboard = ({ results, onBack, onRecommendations }) => {
  const [activeTab, setActiveTab] = useState('skills');
  const [selectedSkill, setSelectedSkill] = useState(null);

  // Calculate skill distribution
  const skillCategories = {};
  results.extracted_skills.forEach(skill => {
    skillCategories[skill.category] = (skillCategories[skill.category] || 0) + 1;
  });

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Skills Analysis for {results.filename}
            </h1>
            <p className="text-gray-500 mt-1">
              Processed {results.character_count} characters • {results.extracted_skills.length} skills found
            </p>
          </div>
          <button 
            onClick={onBack}
            className="flex items-center text-indigo-600 hover:text-indigo-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Analyze Another Document
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          {['skills', 'explanations', 'recommendations'].map(tab => (
            <button
              key={tab}
              className={`px-4 py-3 font-medium text-sm ${
                activeTab === tab 
                  ? 'border-indigo-500 text-indigo-600 border-b-2' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'skills' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Skill Categories */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-700 mb-3">Skill Distribution</h3>
                <div className="space-y-3">
                  {Object.entries(skillCategories).map(([category, count]) => (
                    <div key={category} className="flex items-center">
                      <div className="w-24 text-gray-600 text-sm">{category}</div>
                      <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                        <div 
                          className="bg-indigo-600 h-2.5 rounded-full" 
                          style={{ width: `${(count / results.extracted_skills.length) * 100}%` }}
                        ></div>
                      </div>
                      <div className="ml-3 text-gray-600 text-sm w-10 text-right">{count}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skill List */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Extracted Skills</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {results.extracted_skills.map((skill, index) => (
                    <div 
                      key={index}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedSkill?.name === skill.name 
                          ? 'border-indigo-500 bg-indigo-50' 
                          : 'border-gray-200 hover:border-indigo-300'
                      }`}
                      onClick={() => setSelectedSkill(skill)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-800">{skill.name}</h4>
                          <p className="text-sm text-gray-500">
                            {skill.category} • Confidence: {(skill.confidence * 100).toFixed(0)}%
                          </p>
                        </div>
                        {selectedSkill?.name === skill.name && (
                          <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded">
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Skill Details */}
            {selectedSkill && (
              <div className="mt-6 bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                <h3 className="font-semibold text-indigo-800 mb-2">
                  Details for {selectedSkill.name}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Category</p>
                    <p className="font-medium">{selectedSkill.category}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Confidence</p>
                    <p className="font-medium">{(selectedSkill.confidence * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Evidence</p>
                    <p className="font-medium">
                      {results.explanations.find(e => e.skill === selectedSkill.name)?.evidence || 'Not available'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'explanations' && (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {results.explanations.map((exp, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-800">{exp.skill}</h4>
                  <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded">
                    {exp.reasoning}
                  </span>
                </div>
                <p className="text-gray-600 text-sm">
                  <span className="font-medium">Evidence:</span> {exp.evidence}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {results.recommendations.map((rec, index) => (
              <div key={index} className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-indigo-800 text-lg">{rec.path}</h4>
                  <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded">
                    Match
                  </span>
                </div>
                <p className="text-gray-600">
                  <span className="font-medium">Why it matches:</span> {rec.match_reason}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Career Recommendations Button */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            🎯 Ready to Explore Career Paths?
          </h3>
          <p className="text-gray-600 mb-4 text-sm">
            Get personalized career recommendations based on your extracted skills
          </p>
          <button
            onClick={() => onRecommendations(results)}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-3 px-8 rounded-lg text-lg transition-all shadow-lg hover:shadow-xl"
          >
            View Career Recommendations →
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillDashboard;